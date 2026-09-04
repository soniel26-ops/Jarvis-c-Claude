// =====================================================================
// JARVIS · fontes ao vivo
// Coleta números direto das APIs e grava em data/mission-data.json, sem
// depender do Explorador. Cada coletor devolve um "remendo" (patch) com os
// campos que conseguiu medir; o que não conseguiu vira "INDISPONÍVEL".
// Regras do contrato: número é número; fonte e data em cada bloco; nada
// estimado. Falhas de coleta viram alertas com o prefixo [ao vivo].
//
// Coletores prontos: Stripe, RevenueCat, Meta Ads e "http-json" genérico
// (qualquer URL que devolva JSON, com um mapa de campos em data/fontes.json).
// Configuração por variáveis de ambiente (veja .env.example).
// =====================================================================
import fs from "node:fs";
import path from "node:path";
import { ROOT, ARQ, lerDados } from "./ferramentas.mjs";

const NA = "INDISPONÍVEL";
const ARQ_FONTES = path.join(ROOT, "data", "fontes.json");

// ---------------------------------------------------------------- utilidades
function ontemLocal() { const d = new Date(); d.setHours(0, 0, 0, 0); const fim = new Date(d); d.setDate(d.getDate() - 1); return { ini: d, fim, iso: d.toISOString().slice(0, 10) }; }
function inicioMes() { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; }
function inicioMesPassado() { const d = inicioMes(); d.setMonth(d.getMonth() - 1); return d; }
function mesmoDiaMesPassado() { const d = new Date(); d.setMonth(d.getMonth() - 1); d.setHours(0, 0, 0, 0); return d; }
const seg = d => Math.floor(d.getTime() / 1000);
const round2 = n => Math.round(n * 100) / 100;
async function getJson(url, init = {}, rotulo = url) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${rotulo} HTTP ${r.status}: ${(await r.text().catch(() => "")).slice(0, 120)}`);
  return r.json();
}
function env(k, padrao = "") { return process.env[k] || padrao; }

// ---------------------------------------------------------------- Stripe
// Precisa de STRIPE_SECRET_KEY (chave restrita, só leitura, é o ideal).
export const stripeConfigurado = () => Boolean(env("STRIPE_SECRET_KEY"));
async function coletarStripe() {
  const base = env("STRIPE_API_BASE", "https://api.stripe.com");
  const h = { authorization: `Bearer ${env("STRIPE_SECRET_KEY")}` };
  const listar = async (recurso, params) => {           // pagina até 10 páginas de 100
    const itens = []; let starting_after = null;
    for (let i = 0; i < 10; i++) {
      const q = new URLSearchParams({ ...params, limit: "100" }); if (starting_after) q.set("starting_after", starting_after);
      const j = await getJson(`${base}/v1/${recurso}?${q}`, { headers: h }, `Stripe ${recurso}`);
      itens.push(...(j.data || [])); if (!j.has_more || !j.data?.length) break; starting_after = j.data[j.data.length - 1].id;
    }
    return itens;
  };
  const somaPagos = ch => round2(ch.filter(c => c.paid && !c.refunded).reduce((s, c) => s + c.amount / 100, 0));
  const o = ontemLocal(), hoje = new Date();
  const [chOntem, chMes, chMesPassado, subsNovas, cancelamentos, ativas] = await Promise.all([
    listar("charges", { "created[gte]": seg(o.ini), "created[lt]": seg(o.fim) }),
    listar("charges", { "created[gte]": seg(inicioMes()), "created[lt]": seg(hoje) }),
    listar("charges", { "created[gte]": seg(inicioMesPassado()), "created[lt]": seg(mesmoDiaMesPassado()) }),
    listar("subscriptions", { "created[gte]": seg(o.ini), "created[lt]": seg(o.fim), status: "all" }),
    listar("events", { type: "customer.subscription.deleted", "created[gte]": seg(o.ini), "created[lt]": seg(o.fim) }),
    listar("subscriptions", { status: "active" }),
  ]);
  const falhados = chOntem.filter(c => c.status === "failed");
  const fator = { day: 30, week: 4.33, month: 1, year: 1 / 12 };
  const mrr = round2(ativas.reduce((s, sub) => s + (sub.items?.data || []).reduce((t, it) => { const p = it.price || {}; const f = (fator[p.recurring?.interval] || 1) / (p.recurring?.interval_count || 1); return t + ((p.unit_amount || 0) / 100) * (it.quantity || 1) * f; }, 0), 0));
  const moeda = (chOntem[0] || chMes[0] || {}).currency?.toUpperCase();
  return {
    receita: { ontem: somaPagos(chOntem), mesAtual: somaPagos(chMes), mesmoPeriodoMesPassado: somaPagos(chMesPassado), novasAssinaturas: subsNovas.length, cancelamentos: cancelamentos.length, fonte: "Stripe (ao vivo)", data: o.iso },
    objetivoPrincipal: { atual: mrr, fonte: "Stripe (ao vivo)", data: hoje.toISOString().slice(0, 10) },
    _alertas: falhados.length ? [`${falhados.length} pagamento(s) falhado(s) (${round2(falhados.reduce((s, c) => s + c.amount / 100, 0))} ${moeda || ""}) — Stripe, ${o.iso}`] : [],
    _moeda: moeda,
  };
}

// ---------------------------------------------------------------- RevenueCat (API v2, métricas de visão geral)
// Precisa de REVENUECAT_API_KEY (chave secreta v2) e REVENUECAT_PROJECT_ID.
export const revenuecatConfigurado = () => Boolean(env("REVENUECAT_API_KEY") && env("REVENUECAT_PROJECT_ID"));
async function coletarRevenueCat() {
  const base = env("REVENUECAT_API_BASE", "https://api.revenuecat.com");
  const j = await getJson(`${base}/v2/projects/${env("REVENUECAT_PROJECT_ID")}/metrics/overview`, { headers: { authorization: `Bearer ${env("REVENUECAT_API_KEY")}` } }, "RevenueCat overview");
  const m = Object.fromEntries((j.metrics || []).map(x => [x.id, x]));
  const val = id => (m[id] && typeof m[id].value === "number") ? round2(m[id].value) : NA;
  const hoje = new Date().toISOString().slice(0, 10);
  return {
    // a visão geral não traz "ontem" nem "mês atual"; esses ficam INDISPONÍVEL a menos que outra fonte os preencha
    receita: { ontem: NA, mesAtual: NA, mesmoPeriodoMesPassado: NA, novasAssinaturas: NA, cancelamentos: NA, ultimos28dias: val("revenue"), assinaturasAtivas: val("active_subscriptions"), novosClientes28d: val("new_customers"), testesAtivos: val("active_trials"), fonte: "RevenueCat (ao vivo)", data: hoje },
    objetivoPrincipal: { atual: val("mrr"), fonte: "RevenueCat (ao vivo)", data: hoje },
    trafego: m.active_users ? { usuariosAtivos: val("active_users"), fonte: "RevenueCat (ao vivo)", data: hoje } : undefined,
  };
}

// ---------------------------------------------------------------- Meta Ads (Graph API insights)
// Precisa de META_ACCESS_TOKEN e META_AD_ACCOUNT_ID (só o número, sem "act_").
export const metaConfigurado = () => Boolean(env("META_ACCESS_TOKEN") && env("META_AD_ACCOUNT_ID"));
async function coletarMeta() {
  const base = env("META_API_BASE", "https://graph.facebook.com/v21.0");
  const conta = `act_${env("META_AD_ACCOUNT_ID").replace(/^act_/, "")}`;
  const q = extra => new URLSearchParams({ date_preset: "yesterday", access_token: env("META_ACCESS_TOKEN"), ...extra });
  const [contaJ, adsJ] = await Promise.all([
    getJson(`${base}/${conta}/insights?${q({ level: "account", fields: "spend,purchase_roas" })}`, {}, "Meta insights (conta)"),
    getJson(`${base}/${conta}/insights?${q({ level: "ad", fields: "ad_name,spend,purchase_roas", limit: "200" })}`, {}, "Meta insights (anúncios)"),
  ]);
  const roasDe = row => { const r = (row.purchase_roas || []).find(x => /purchase/.test(x.action_type)) || row.purchase_roas?.[0]; return r ? round2(parseFloat(r.value)) : null; };
  const c = contaJ.data?.[0] || {};
  const ads = (adsJ.data || []).map(a => ({ nome: a.ad_name, gasto: parseFloat(a.spend || 0), roas: roasDe(a) })).filter(a => a.gasto > 0 && a.roas !== null).sort((a, b) => b.roas - a.roas);
  const o = ontemLocal();
  return {
    anuncios: { gastoOntem: c.spend !== undefined ? round2(parseFloat(c.spend)) : NA, roas: roasDe(c) ?? NA, melhorCriativo: ads[0] ? `${ads[0].nome} · ROAS ${ads[0].roas}` : NA, piorCriativo: ads.length > 1 ? `${ads[ads.length - 1].nome} · ROAS ${ads[ads.length - 1].roas}` : NA, fonte: "Meta Ads (ao vivo)", data: o.iso },
    _alertas: ads.filter(a => a.roas < 1 && a.gasto > 0).slice(-3).map(a => `Criativo ${a.nome} com ROAS ${a.roas} ontem — Meta Ads, ${o.iso}`),
  };
}

// ---------------------------------------------------------------- HTTP JSON genérico (data/fontes.json)
// { "fontes": [ { "nome": "Painel interno", "url": "https://...", "headers": { "Authorization": "Bearer ${MEU_TOKEN}" },
//                "mapa": { "trafego.cadastros": "data.signups.yesterday", "trafego.usuariosAtivos": "data.dau" } } ] }
export function fontesGenericas() { try { return (JSON.parse(fs.readFileSync(ARQ_FONTES, "utf8")).fontes || []).filter(f => f.url && f.mapa); } catch { return []; } }
function caminho(obj, p) { return String(p).replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), obj); }
const substituirEnv = s => String(s).replace(/\$\{([A-Z0-9_]+)\}/g, (_, k) => env(k));
async function coletarGenerica(f) {
  const headers = Object.fromEntries(Object.entries(f.headers || {}).map(([k, v]) => [k, substituirEnv(v)]));
  const j = await getJson(substituirEnv(f.url), { headers }, f.nome || f.url);
  const patch = {}; const hoje = new Date().toISOString().slice(0, 10);
  for (const [destino, origem] of Object.entries(f.mapa)) {
    const [bloco, campo] = destino.split("."); if (!bloco || !campo) continue;
    let v = caminho(j, origem); if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) v = Number(v);
    patch[bloco] ??= { fonte: `${f.nome || "HTTP"} (ao vivo)`, data: f.data || hoje };
    patch[bloco][campo] = (typeof v === "number" && isFinite(v)) || typeof v === "string" ? v : NA;
  }
  return patch;
}

// ---------------------------------------------------------------- orquestração
export function coletoresAtivos() {
  const l = [];
  if (stripeConfigurado()) l.push({ nome: "Stripe", run: coletarStripe });
  if (revenuecatConfigurado()) l.push({ nome: "RevenueCat", run: coletarRevenueCat });
  if (metaConfigurado()) l.push({ nome: "Meta Ads", run: coletarMeta });
  for (const f of fontesGenericas()) l.push({ nome: f.nome || f.url, run: () => coletarGenerica(f) });
  return l;
}
export const fontesConfiguradas = () => coletoresAtivos().length > 0;

// Junta os remendos no arquivo. Um valor real nunca é sobrescrito por INDISPONÍVEL de outra fonte.
export async function coletarFontes({ log = console.log } = {}) {
  const coletores = coletoresAtivos(); if (!coletores.length) return { ok: false, motivo: "nenhuma fonte configurada" };
  const d = lerDados(); if (d.erro) return { ok: false, motivo: d.erro };
  const alertas = []; const falhas = []; const sucesso = []; let moeda = null;
  const resultados = await Promise.allSettled(coletores.map(c => c.run()));
  resultados.forEach((r, i) => {
    const nome = coletores[i].nome;
    if (r.status === "rejected") { falhas.push(nome); alertas.push(`[ao vivo] ${nome} INDISPONÍVEL: ${String(r.reason?.message || r.reason).slice(0, 120)}`); log(`[fontes] ${nome} falhou: ${r.reason?.message || r.reason}`); return; }
    sucesso.push(nome); const patch = r.value || {};
    for (const a of patch._alertas || []) alertas.push(`[ao vivo] ${a}`);
    if (patch._moeda) moeda = patch._moeda;
    for (const [bloco, campos] of Object.entries(patch)) {
      if (bloco.startsWith("_") || !campos) continue;
      d[bloco] ??= {};
      for (const [k, v] of Object.entries(campos)) {
        if (k === "fonte") { const atual = d[bloco].fonte; d[bloco].fonte = atual && /ao vivo/.test(atual) && !atual.includes(v) ? `${atual} + ${v}` : v; continue; }
        if (v === NA && d[bloco][k] !== undefined && d[bloco][k] !== NA && /ao vivo/.test(String(d[bloco].fonte || ""))) continue; // não apaga valor real já coletado hoje
        d[bloco][k] = v;
      }
    }
  });
  if (!sucesso.length) { log("[fontes] nenhuma fonte respondeu; arquivo não alterado"); return { ok: false, motivo: "todas as fontes falharam", falhas }; }
  d.alertas = [...(d.alertas || []).filter(a => !String(a).startsWith("[ao vivo]")), ...alertas];
  d.meta ??= {}; d.meta.fonte = "REAL"; d.meta.atualizadoEm = new Date().toISOString(); d.meta.fontesAoVivo = sucesso;
  if (moeda && d.meta.moeda !== moeda) d.meta.moeda = moeda;
  fs.writeFileSync(ARQ.dados, JSON.stringify(d, null, 2) + "\n");
  log(`[fontes] coletado de ${sucesso.join(", ")}${falhas.length ? " · falhou: " + falhas.join(", ") : ""}`);
  return { ok: true, sucesso, falhas, alertas };
}

// Ferramenta para o JARVIS ("atualiza os dados agora")
export const FERRAMENTA_ATUALIZAR = {
  name: "atualizar_dados",
  description: "Coleta agora os números das fontes ao vivo configuradas (Stripe, RevenueCat, Meta Ads, endpoints próprios) e atualiza o painel. Use quando o usuário pedir dados atualizados ou desconfiar de um número.",
  input_schema: { type: "object", properties: {} },
};
