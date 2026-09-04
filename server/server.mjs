// =====================================================================
// JARVIS · servidor local (v2 · agêntico)
// - serve o repositório como site estático (painel + data/mission-data.json)
// - POST /api/chat      → resposta do Claude em streaming (SSE), com ferramentas
// - POST /api/briefing  → resumo matinal em streaming, pelo mesmo caminho
// - GET  /api/eventos   → canal SSE de eventos proativos (lembretes, dados novos)
// - GET  /api/health    → credencial, modelo, ferramentas ativas
// A chave da API fica só aqui, no processo Node. O navegador nunca a vê.
//
// Compatível com Claude Fable 5.1 (histórico só de acréscimos, prompt de
// sistema e ferramentas congelados por sessão, blocos de raciocínio devolvidos
// intactos) e com a família Opus 5.
// =====================================================================
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { ROOT, ARQ, FERRAMENTAS_LOCAIS, FERRAMENTA_WEB, executarFerramenta, lerTexto, lerDados, mtime, listarBriefings, lerLembretes, gravarLembretes } from "./ferramentas.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
carregarDotEnv(path.join(here, ".env"));

const PORT = Number(process.env.JARVIS_PORT || 8080);
const MODEL = process.env.JARVIS_MODEL || "claude-fable-5-1";
const EFFORT = process.env.JARVIS_EFFORT || "medium";
const NOME = process.env.JARVIS_NOME_USUARIO || "senhor";
const MAX_ITERACOES = 8;                  // limite de rodadas de ferramentas por pergunta
const MAX_TURNOS_SESSAO = 60;             // acima disso a sessão recomeça (histórico é só de acréscimos)

const recursos = {                        // recursos opcionais; desligam sozinhos se a API desta conta rejeitar
  fallbacks: (process.env.JARVIS_FALLBACKS ?? "1") !== "0",
  bindingControls: true,
  webSearch: (process.env.JARVIS_WEB_SEARCH ?? "1") !== "0",
};
const ehFable = /^claude-(fable|mythos)-5/.test(MODEL);
const ehOpus5 = /^claude-opus-5/.test(MODEL);

const temCredencial = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const client = new Anthropic(); // lê ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / perfil `ant auth login`

// =====================================================================
// 1. PROMPT DO SISTEMA (estável; congelado por sessão)
// =====================================================================
const SISTEMA_ESTAVEL = `Você é JARVIS, o assistente pessoal de ${NOME}. Você fala pelo painel de controle da missão e suas respostas são lidas em voz alta.

## Quem você é
Sereno, preciso, levemente britânico no humor, direto ao ponto. Você conhece o negócio de ${NOME} pelos dados do painel, pelos briefings dos agentes e pela memória. Você é útil como um chefe de gabinete: antecipa, contextualiza, lembra o que foi dito.

## Como falar
Português do Brasil. Respostas de 1 a 4 frases, em prosa, sem listas, markdown, emojis, cabeçalhos ou símbolos; a síntese de voz lê tudo literalmente, então escreva números de forma natural para a fala (por exemplo "mil duzentos e quarenta reais", "vinte por cento", "duas e meia da tarde"), nunca "R$", "%", "·", "/", parênteses ou abreviações. Trate ${NOME} pelo tratamento acima, sem exagerar. Abra com a resposta; o contexto vem depois, só se mudar a decisão. Quando ${NOME} pedir mais detalhe, dê mais detalhe.

## Verdade
Todo número vem de uma fonte: os DADOS abaixo, um arquivo que você leu com ferramenta, ou uma busca na web. Nunca invente, estime ou arredonde para preencher lacunas. Um campo "INDISPONÍVEL" significa que a fonte não forneceu o número: diga isso e não substitua por nada. Diferencie projeção de valor real. Se algo veio da web, diga que veio da web e de quando é.

## Ferramentas
Use as ferramentas sem pedir permissão para ações reversíveis e locais: ler briefings, FAQ e registro; lembrar e esquecer na memória; criar e cancelar lembretes; marcar recomendações como feitas ou descartadas; adicionar entradas ao FAQ; ajustar a meta do objetivo principal; pesquisar na web para o que os dados não cobrem (clima, notícias, fatos, câmbio, cálculos que dependem de informação externa). Antes de agir sobre uma recomendação ou o FAQ, confirme que entendeu a intenção quando a frase de ${NOME} for ambígua. Quando terminar uma ação, confirme em uma frase o que foi feito, com base no resultado da ferramenta, nunca no que você pretendia fazer.

Você não envia e-mails, não publica, não gasta dinheiro e não altera dados de receita ou anúncios: isso é do Operador e do Explorador, mediante aprovação de ${NOME}. Se pedirem, explique isso e ofereça deixar um lembrete ou uma nota na memória.

## Memória
A seção MEMÓRIA abaixo é o que ${NOME} pediu para você lembrar em sessões anteriores. Use-a sem que ele precise repetir. Quando ${NOME} disser "lembre", "anote", "não esqueça" ou contar uma preferência, um fato pessoal ou uma decisão, grave com a ferramenta memoria. Quando ele corrigir algo que está na memória, atualize em vez de duplicar.

## Limites
Quando ${NOME} estiver só pensando alto ou perguntando, responda; não aja. Quando pedir uma ação, aja e confirme. Se a pergunta não puder ser respondida com o que você tem, diga isso em uma frase e ofereça o caminho mais curto para conseguir a informação.`;

function dataHoje() { return new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
function blocoDados(d = lerDados()) {
  return `## DADOS DO PAINEL\nFonte: ${d?.meta?.fonte ?? "?"} · atualizados em ${d?.meta?.atualizadoEm ?? "?"}\n${JSON.stringify(d, null, 1)}`;
}
function blocoMemoria() {
  const m = lerTexto(ARQ.memoria).trim();
  return `## MEMÓRIA\n${m || "(vazia)"}`;
}
function blocoContexto() {
  const lembretes = lerLembretes().filter(l => !l.disparado);
  return `## CONTEXTO DA SESSÃO\nHoje é ${dataHoje()}. Hora de início da sessão: ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Fuso do servidor: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.\nLembretes pendentes: ${lembretes.length ? lembretes.map(l => `${l.id} · ${l.texto} · ${l.quando}`).join("; ") : "nenhum"}.\nBriefings disponíveis: ${listarBriefings().slice(-5).join(", ") || "nenhum"}.`;
}

// =====================================================================
// 2. SESSÕES (histórico só de acréscimos; system + tools congelados)
// =====================================================================
const sessoes = new Map();
function novaSessao(id) {
  const s = {
    id, criadaEm: Date.now(), dadosMtime: mtime(ARQ.dados),
    system: [
      { type: "text", text: SISTEMA_ESTAVEL, cache_control: { type: "ephemeral" } },
      { type: "text", text: `${blocoMemoria()}\n\n${blocoContexto()}\n\n${blocoDados()}` },
    ],
    tools: [...FERRAMENTAS_LOCAIS, ...(recursos.webSearch ? [FERRAMENTA_WEB] : [])],
    messages: [],
  };
  sessoes.set(id, s); return s;
}
function obterSessao(id) {
  id = String(id || "").slice(0, 64) || randomUUID();
  let s = sessoes.get(id);
  if (!s || s.messages.length > MAX_TURNOS_SESSAO || Date.now() - s.criadaEm > 12 * 3600e3) s = novaSessao(id);
  return s;
}
// Se os dados mudaram desde o início da sessão, entra como mensagem de sistema (acréscimo, não edição).
function atualizacaoDeDados(s) {
  const m = mtime(ARQ.dados); if (m === s.dadosMtime) return null;
  s.dadosMtime = m; return { role: "system", content: `Atualização: o arquivo de dados mudou. Use esta versão a partir de agora.\n${blocoDados()}` };
}

// =====================================================================
// 4. LOOP AGÊNTICO EM STREAMING
// =====================================================================
function paramsBase(s) {
  const p = { model: MODEL, max_tokens: 2048, output_config: { effort: EFFORT }, system: s.system, tools: s.tools, messages: s.messages };
  const betas = [];
  if (recursos.fallbacks && (ehFable || ehOpus5)) { betas.push("server-side-fallback-2026-07-01"); p.fallbacks = "default"; }
  if (ehFable && recursos.bindingControls) { betas.push("thinking-binding-controls-2026-08-01"); p.thinking = { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } }; }
  if (betas.length) p.betas = betas;
  return p;
}
function semThinking(msgs) { return msgs.map(m => Array.isArray(m.content) ? { ...m, content: m.content.filter(b => b.type !== "thinking" && b.type !== "redacted_thinking") } : m); }

// Tenta a chamada; se a API rejeitar um recurso beta, desliga-o e repete; se rejeitar blocos de raciocínio antigos, remove-os e repete uma vez.
async function chamarComDegradacao(s, emitir) {
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const p = paramsBase(s);
    const stream = client.beta.messages.stream(p);
    stream.on("text", t => emitir("delta", { texto: t }));
    stream.on("streamEvent", ev => {
      if (ev.type === "content_block_start" && ev.content_block?.type === "server_tool_use") emitir("status", { texto: "pesquisando na web" });
      if (ev.type === "content_block_start" && ev.content_block?.type === "tool_use") emitir("status", { texto: `usando ${ev.content_block.name}` });
    });
    try { return await stream.finalMessage(); }
    catch (e) {
      if (!(e instanceof Anthropic.BadRequestError)) throw e;
      const msg = e.message || "";
      if (recursos.fallbacks && /fallback/i.test(msg)) { console.warn("[jarvis] fallbacks rejeitados; desligando:", msg); recursos.fallbacks = false; continue; }
      if (recursos.bindingControls && /binding|block_binding/i.test(msg)) { console.warn("[jarvis] binding controls rejeitados; desligando:", msg); recursos.bindingControls = false; continue; }
      if (recursos.webSearch && /web_search/i.test(msg)) { console.warn("[jarvis] web_search rejeitado; desligando:", msg); recursos.webSearch = false; s.tools = s.tools.filter(t => t.type !== FERRAMENTA_WEB.type); continue; }
      if (/signature|thinking/i.test(msg)) { console.warn("[jarvis] blocos de raciocínio inválidos; removendo do histórico:", msg); s.messages = semThinking(s.messages); continue; }
      throw e;
    }
  }
  throw new Error("não foi possível completar a chamada após degradações sucessivas");
}

async function conversar(s, textoUsuario, emitir) {
  s.messages.push({ role: "user", content: textoUsuario });
  const upd = atualizacaoDeDados(s); if (upd) s.messages.push(upd);
  const uso = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const ferramentasUsadas = []; let textoFinal = ""; let modelo = MODEL; let truncado = false;

  for (let it = 0; it < MAX_ITERACOES; it++) {
    const msg = await chamarComDegradacao(s, emitir);
    for (const k of Object.keys(uso)) uso[k] += msg.usage?.[k] || 0;
    modelo = msg.model || modelo;
    if (msg.stop_reason === "refusal") {
      // conteúdo parcial já transmitido deve ser descartado pelo cliente
      s.messages.push({ role: "assistant", content: msg.content.length ? msg.content : [{ type: "text", text: "(recusado)" }] });
      emitir("recusa", { texto: `Não posso ajudar com isso pelo painel, ${NOME}.`, categoria: msg.stop_details?.category ?? null });
      return { uso, modelo, ferramentasUsadas, recusa: true };
    }
    s.messages.push({ role: "assistant", content: msg.content });     // intacto, com blocos de raciocínio
    textoFinal += msg.content.filter(b => b.type === "text").map(b => b.text).join("");
    for (const b of msg.content) if (b.type === "server_tool_use") ferramentasUsadas.push(b.name);
    if (msg.stop_reason === "pause_turn") continue;                     // servidor retoma sozinho
    if (msg.stop_reason === "max_tokens") { truncado = true; break; }
    const usos = msg.content.filter(b => b.type === "tool_use");
    if (!usos.length) break;                                             // end_turn
    const resultados = [];
    for (const u of usos) {
      ferramentasUsadas.push(u.name); emitir("status", { texto: `executando ${u.name}` });
      try { const r = await executarFerramenta(u.name, u.input || {}); resultados.push({ type: "tool_result", tool_use_id: u.id, content: String(r) }); console.log(`[jarvis] ${u.name}(${JSON.stringify(u.input)}) → ${String(r).slice(0, 80)}`); }
      catch (e) { resultados.push({ type: "tool_result", tool_use_id: u.id, content: `Erro: ${e.message}`, is_error: true }); }
    }
    s.messages.push({ role: "user", content: resultados });             // todos os resultados em uma única mensagem
    if (usos.some(u => ["memoria", "lembrete", "atualizar_recomendacao", "adicionar_faq", "atualizar_objetivo"].includes(u.name))) difundir("acao", { ferramentas: usos.map(u => u.name) });
  }
  return { uso, modelo, ferramentasUsadas, texto: textoFinal, truncado };
}

// =====================================================================
// 5. EVENTOS PROATIVOS (SSE): lembretes e dados novos
// =====================================================================
const clientesSSE = new Set();
function difundir(evento, dados) { const s = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`; for (const res of clientesSSE) { try { res.write(s); } catch { clientesSSE.delete(res); } } }
setInterval(() => {
  const todos = lerLembretes(); let mudou = false;
  for (const l of todos) if (!l.disparado && new Date(l.quando) <= Date.now()) { l.disparado = true; l.disparadoEm = new Date().toISOString(); mudou = true; difundir("lembrete", { id: l.id, texto: l.texto, quando: l.quando }); console.log(`[jarvis] lembrete disparado: ${l.texto}`); }
  if (mudou) gravarLembretes(todos);
}, 10000);
let ultimoMtimeDados = mtime(ARQ.dados);
setInterval(() => { const m = mtime(ARQ.dados); if (m !== ultimoMtimeDados) { ultimoMtimeDados = m; const d = lerDados(); difundir("dados", { fonte: d?.meta?.fonte, atualizadoEm: d?.meta?.atualizadoEm, alertas: d?.alertas?.length ?? 0 }); } }, 5000);
setInterval(() => { for (const res of clientesSSE) { try { res.write(": ping\n\n"); } catch { clientesSSE.delete(res); } } }, 25000);

// =====================================================================
// 6. HTTP
// =====================================================================
function mensagemDeErro(e) {
  if (e instanceof Anthropic.AuthenticationError) return { status: 401, erro: "Credencial inválida. Verifique ANTHROPIC_API_KEY em server/.env." };
  if (e instanceof Anthropic.PermissionDeniedError) return { status: 403, erro: `A chave não tem permissão para o modelo ${MODEL}.` };
  if (e instanceof Anthropic.NotFoundError) return { status: 404, erro: `Modelo não encontrado: ${MODEL}. Ajuste JARVIS_MODEL.` };
  if (e instanceof Anthropic.RateLimitError) return { status: 429, erro: "Limite de requisições atingido. Tente em alguns segundos." };
  if (e instanceof Anthropic.BadRequestError) return { status: 400, erro: `Requisição inválida: ${e.message}` };
  if (e instanceof Anthropic.APIConnectionError) return { status: 502, erro: "Sem conexão com a API do Claude." };
  if (e instanceof Anthropic.APIError) return { status: e.status || 500, erro: `Erro da API (${e.status}): ${e.message}` };
  return { status: 500, erro: e.message || String(e) };
}
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
function lerJson(req) {
  return new Promise((res, rej) => {
    let s = ""; req.on("data", c => { s += c; if (s.length > 1e6) { rej(new Error("corpo grande demais")); req.destroy(); } });
    req.on("end", () => { try { res(s ? JSON.parse(s) : {}); } catch { rej(new Error("JSON inválido")); } });
    req.on("error", rej);
  });
}
function enviarJson(res, status, obj) { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); }
function abrirSSE(res) { res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" }); res.write(": ok\n\n"); return (evento, dados) => res.write(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`); }
function servirArquivo(res, urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel === "/") rel = "/mission-control/index.html";
  if (rel.endsWith("/")) rel += "index.html";
  const abs = path.normalize(path.join(ROOT, rel));
  if (!abs.startsWith(ROOT + path.sep) || /(^|\/)(\.git|node_modules|server)(\/|$)/.test(rel)) { res.writeHead(403); return res.end("proibido"); }
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end("não encontrado"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(abs).pipe(res);
  });
}
const PEDIDO_BRIEFING = `Faça o resumo matinal falado, em até duzentas e cinquenta palavras, nesta ordem: cumprimento curto; itens urgentes de alertas, se houver; receita de ontem, acumulado do mês e comparação com o mês passado; anúncios com melhor e pior criativo; tráfego e variações; e-mail com resolvidos, rascunhos e escalados; situação do objetivo principal; lembretes pendentes de hoje, se houver. Depois diga "As três recomendações do Conselheiro" e leia as três com ação, evidência e o que acontece se ignorar. Termine lendo as pendências de sete dias, se existirem. Se houver um briefing do Explorador de hoje em data/briefings, leia-o antes e use os detalhes dele. Prosa corrida, pronta para voz.`;

const server = http.createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];
  try {
    if (url.startsWith("/api/")) {
      const origem = req.headers.origin; const host = req.headers.host;
      if (origem && host && new URL(origem).host !== host) return enviarJson(res, 403, { erro: "origem não permitida" });
      if (url === "/api/health" && req.method === "GET")
        return enviarJson(res, 200, { ok: true, configured: temCredencial, model: MODEL, effort: EFFORT, tools: FERRAMENTAS_LOCAIS.map(t => t.name).concat(recursos.webSearch ? ["web_search"] : []), streaming: true, dataFile: fs.existsSync(ARQ.dados) });
      if (url === "/api/eventos" && req.method === "GET") { abrirSSE(res); clientesSSE.add(res); req.on("close", () => clientesSSE.delete(res)); return; }
      if (req.method !== "POST") return enviarJson(res, 405, { erro: "use POST" });
      if (!temCredencial) return enviarJson(res, 503, { erro: "Sem credencial. Defina ANTHROPIC_API_KEY em server/.env (veja .env.example)." });
      const body = await lerJson(req);
      if (url === "/api/session/reset") { sessoes.delete(String(body.sessionId || "")); return enviarJson(res, 200, { ok: true }); }
      if (url !== "/api/chat" && url !== "/api/briefing") return enviarJson(res, 404, { erro: "rota desconhecida" });
      const texto = url === "/api/briefing" ? PEDIDO_BRIEFING : String(body.message ?? "").trim();
      if (!texto) return enviarJson(res, 400, { erro: "message vazio" });
      const s = obterSessao(body.sessionId);
      const emitir = abrirSSE(res);
      try {
        const r = await conversar(s, texto, emitir);
        emitir("done", { model: r.modelo, usage: r.uso, tools: r.ferramentasUsadas, truncated: r.truncado === true, refusal: r.recusa === true, texto: r.texto ?? "" });
      } catch (e) {
        const m = mensagemDeErro(e); console.error(`[jarvis] POST ${url} → ${m.status}: ${m.erro}`);
        // devolve a sessão a um estado consistente: remove o turno do usuário sem resposta
        while (s.messages.length && s.messages[s.messages.length - 1].role !== "assistant") s.messages.pop();
        emitir("erro", { status: m.status, erro: m.erro });
      }
      return res.end();
    }
    return servirArquivo(res, url);
  } catch (e) {
    const m = mensagemDeErro(e); console.error(`[jarvis] ${req.method} ${url} → ${m.status}: ${m.erro}`);
    if (!res.headersSent) return enviarJson(res, m.status, { erro: m.erro }); res.end();
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`JARVIS online em http://localhost:${PORT}/mission-control/`);
  console.log(`  modelo: ${MODEL} · effort: ${EFFORT} · fallbacks: ${recursos.fallbacks ? "ativos" : "desligados"} · web search: ${recursos.webSearch ? "ativa" : "desligada"}`);
  console.log(`  ferramentas locais: ${FERRAMENTAS_LOCAIS.map(t => t.name).join(", ")}`);
  console.log(`  credencial: ${temCredencial ? "encontrada no ambiente" : "AUSENTE — o painel funciona em modo local; copie server/.env.example para server/.env"}`);
  console.log(`  dados: ${fs.existsSync(ARQ.dados) ? ARQ.dados : "data/mission-data.json NÃO encontrado"}`);
});

// .env mínimo, sem dependência: KEY=VALUE por linha, # comenta, não sobrescreve variáveis já definidas
function carregarDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const linha of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*(#.*)?$/);
    if (!m || m[1] in process.env) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
