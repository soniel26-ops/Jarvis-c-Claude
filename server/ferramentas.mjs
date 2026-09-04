// =====================================================================
// JARVIS · ferramentas locais e acesso aos arquivos do repositório
// Importado pelo servidor (server.mjs) e pelo diagnóstico (doctor.mjs).
// Tudo aqui escreve apenas em data/ e conhecimento/ e lê só caminhos permitidos.
// =====================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");

export const ARQ = {
  dados: path.join(ROOT, "data", "mission-data.json"),
  memoria: path.join(ROOT, "data", "memoria.md"),
  lembretes: path.join(ROOT, "data", "lembretes.json"),
  registro: path.join(ROOT, "data", "registro-recomendacoes.md"),
  faq: path.join(ROOT, "conhecimento", "faq.md"),
  briefings: path.join(ROOT, "data", "briefings"),
};
export const LEITURA_PERMITIDA = [/^data\//, /^conhecimento\//, /^agents\//, /^README\.md$/];

export function lerTexto(p, fallback = "") { try { return fs.readFileSync(p, "utf8"); } catch { return fallback; } }
export function lerDados() { try { return JSON.parse(fs.readFileSync(ARQ.dados, "utf8")); } catch (e) { return { erro: `mission-data.json ilegível: ${e.message}` }; } }
export function mtime(p) { try { return fs.statSync(p).mtimeMs; } catch { return 0; } }
// =====================================================================
// 2. FERRAMENTAS LOCAIS
// =====================================================================
export const FERRAMENTAS_LOCAIS = [
  {
    name: "ler_arquivo",
    description: "Lê um arquivo do repositório do JARVIS: briefings do Explorador e do Operador (data/briefings/AAAA-MM-DD-explorador.md), o registro de recomendações (data/registro-recomendacoes.md), o FAQ (conhecimento/faq.md), a memória (data/memoria.md), os prompts dos agentes (agents/*.md) e o README. Use quando a resposta exigir um detalhe que não está nos DADOS do painel.",
    input_schema: { type: "object", properties: { caminho: { type: "string", description: "Caminho relativo à raiz do repositório, por exemplo data/briefings/2026-09-03-explorador.md" } }, required: ["caminho"] },
  },
  {
    name: "listar_briefings",
    description: "Lista os arquivos de briefing disponíveis em data/briefings, do mais antigo ao mais recente.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "memoria",
    description: "Memória persistente entre sessões (data/memoria.md). 'lembrar' grava um fato, preferência ou decisão em uma linha; 'esquecer' remove as linhas que contêm o trecho; 'listar' devolve tudo. Grave o que o usuário pediu para lembrar ou o que claramente importa para o futuro; não grave o que já está nos dados do painel.",
    input_schema: { type: "object", properties: { acao: { type: "string", enum: ["lembrar", "esquecer", "listar"] }, texto: { type: "string", description: "Para 'lembrar': o fato em uma frase. Para 'esquecer': trecho que identifica a linha." } }, required: ["acao"] },
  },
  {
    name: "lembrete",
    description: "Lembretes com aviso falado no painel (data/lembretes.json). 'criar' exige texto e um de: em_minutos (número) ou horario (ISO 8601 ou 'HH:MM' de hoje, ou 'AAAA-MM-DD HH:MM'). 'cancelar' exige id. 'listar' mostra os pendentes. Quando o horário chegar, o painel fala o lembrete.",
    input_schema: { type: "object", properties: { acao: { type: "string", enum: ["criar", "listar", "cancelar"] }, texto: { type: "string" }, em_minutos: { type: "number" }, horario: { type: "string" }, id: { type: "string" } }, required: ["acao"] },
  },
  {
    name: "atualizar_recomendacao",
    description: "Marca uma recomendação do Conselheiro como FEITO ou DESCARTADO no registro (data/registro-recomendacoes.md) e a retira de pendentes7dias no mission-data.json. Passe um trecho que identifique a recomendação (por exemplo 'IMG-12'). Só use quando o usuário disser que fez ou que não vai fazer.",
    input_schema: { type: "object", properties: { trecho: { type: "string" }, status: { type: "string", enum: ["FEITO", "DESCARTADO"] } }, required: ["trecho", "status"] },
  },
  {
    name: "adicionar_faq",
    description: "Acrescenta uma entrada ao FAQ do Operador (conhecimento/faq.md) com ID sequencial. Use quando o usuário disser como responder a uma pergunta recorrente de clientes. A resposta deve estar na voz do usuário, pronta para enviar.",
    input_schema: { type: "object", properties: { assunto: { type: "string" }, perguntas: { type: "array", items: { type: "string" }, description: "2 a 4 formas como o cliente pergunta" }, resposta: { type: "string" }, nao: { type: "string", description: "Limites: o que ainda exige escalação neste assunto" } }, required: ["assunto", "perguntas", "resposta"] },
  },
  {
    name: "atualizar_objetivo",
    description: "Ajusta a meta do objetivo principal no mission-data.json: alvo (número), prazo (AAAA-MM-DD), rotulo (ex.: MRR) e/ou o texto do objetivo no cabeçalho. Só campos informados são alterados. Não altera valores medidos (atual, receita, anúncios).",
    input_schema: { type: "object", properties: { alvo: { type: "number" }, prazo: { type: "string" }, rotulo: { type: "string" }, objetivo_texto: { type: "string" } } },
  },
];
export const FERRAMENTA_WEB = { type: "web_search_20260209", name: "web_search", max_uses: 3 };

// Notificação no celular (Telegram). Só entra na lista de ferramentas quando TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID existem.
export const FERRAMENTA_TELEGRAM = {
  name: "notificar_celular",
  description: "Envia uma mensagem curta para o celular do usuário pelo Telegram. Use quando ele pedir para mandar algo para o celular, ou para avisar de algo que ele precisa ver longe do painel. Texto simples, sem markdown.",
  input_schema: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] },
};
export function telegramConfigurado() { return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID); }
export async function notificarTelegram(texto) {
  if (!telegramConfigurado()) throw new Error("Telegram não configurado (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)");
  const base = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
  const r = await fetch(`${base}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: String(texto).slice(0, 4000), disable_web_page_preview: true }),
  });
  if (!r.ok) throw new Error(`Telegram HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return "Mensagem enviada ao celular.";
}

function caminhoSeguro(rel) {
  const limpo = String(rel || "").replace(/^\.?\//, "").replace(/\\/g, "/");
  if (!LEITURA_PERMITIDA.some(r => r.test(limpo)) || limpo.includes("..")) throw new Error(`leitura não permitida: ${limpo}`);
  const abs = path.normalize(path.join(ROOT, limpo));
  if (!abs.startsWith(ROOT + path.sep)) throw new Error("caminho inválido");
  return abs;
}
export function listarBriefings() { try { return fs.readdirSync(ARQ.briefings).filter(f => f.endsWith(".md")).sort(); } catch { return []; } }
export function lerLembretes() { try { return JSON.parse(fs.readFileSync(ARQ.lembretes, "utf8")); } catch { return []; } }
export function gravarLembretes(l) { fs.writeFileSync(ARQ.lembretes, JSON.stringify(l, null, 2) + "\n"); }
function gravarJson(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n"); }

export function interpretarHorario({ em_minutos, horario }) {
  if (typeof em_minutos === "number" && em_minutos > 0) return new Date(Date.now() + em_minutos * 60000);
  if (!horario) throw new Error("informe em_minutos ou horario");
  let m = horario.match(/^(\d{1,2}):(\d{2})$/);
  if (m) { const d = new Date(); d.setHours(+m[1], +m[2], 0, 0); if (d < Date.now()) d.setDate(d.getDate() + 1); return d; }
  m = horario.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const d = new Date(horario); if (isNaN(d)) throw new Error(`horário não reconhecido: ${horario}`); return d;
}

export async function executarFerramenta(nome, input) {
  switch (nome) {
    case "ler_arquivo": {
      const abs = caminhoSeguro(input.caminho);
      if (!fs.existsSync(abs)) return `Arquivo não encontrado: ${input.caminho}. Disponíveis em data/briefings: ${listarBriefings().join(", ") || "nenhum"}.`;
      const t = fs.readFileSync(abs, "utf8"); return t.length > 20000 ? t.slice(0, 20000) + "\n[... truncado em 20 mil caracteres]" : t;
    }
    case "listar_briefings": { const l = listarBriefings(); return l.length ? l.join("\n") : "Nenhum briefing gravado ainda. Os agentes gravam em data/briefings/ quando as rotinas rodam."; }
    case "memoria": {
      const linhas = lerTexto(ARQ.memoria).split("\n").filter(Boolean);
      if (input.acao === "listar") return linhas.filter(l => l.startsWith("- ")).join("\n") || "(memória vazia)";
      if (input.acao === "lembrar") {
        if (!input.texto) throw new Error("texto obrigatório");
        const linha = `- [${new Date().toISOString().slice(0, 10)}] ${input.texto.trim().replace(/\n+/g, " ")}`;
        fs.appendFileSync(ARQ.memoria, (lerTexto(ARQ.memoria).endsWith("\n") || !lerTexto(ARQ.memoria) ? "" : "\n") + linha + "\n");
        return `Gravado na memória: ${linha}`;
      }
      if (input.acao === "esquecer") {
        if (!input.texto) throw new Error("texto obrigatório");
        const alvo = input.texto.toLowerCase(); const mantidas = linhas.filter(l => !(l.startsWith("- ") && l.toLowerCase().includes(alvo)));
        const removidas = linhas.length - mantidas.length; fs.writeFileSync(ARQ.memoria, mantidas.join("\n") + "\n");
        return removidas ? `Removidas ${removidas} linha(s) contendo "${input.texto}".` : `Nada na memória contém "${input.texto}".`;
      }
      throw new Error("acao inválida");
    }
    case "lembrete": {
      const todos = lerLembretes();
      if (input.acao === "listar") { const p = todos.filter(l => !l.disparado); return p.length ? p.map(l => `${l.id} · ${l.texto} · ${new Date(l.quando).toLocaleString("pt-BR")}`).join("\n") : "Nenhum lembrete pendente."; }
      if (input.acao === "cancelar") { const i = todos.findIndex(l => l.id === input.id && !l.disparado); if (i < 0) return `Lembrete ${input.id} não encontrado.`; const [r] = todos.splice(i, 1); gravarLembretes(todos); return `Cancelado: ${r.texto}.`; }
      if (input.acao === "criar") {
        if (!input.texto) throw new Error("texto obrigatório");
        const quando = interpretarHorario(input); const id = "L" + Date.now().toString(36).slice(-5).toUpperCase();
        todos.push({ id, texto: input.texto.trim(), quando: quando.toISOString(), criadoEm: new Date().toISOString(), disparado: false }); gravarLembretes(todos);
        return `Lembrete ${id} criado para ${quando.toLocaleString("pt-BR")}: ${input.texto}`;
      }
      throw new Error("acao inválida");
    }
    case "atualizar_recomendacao": {
      const trecho = String(input.trecho || "").toLowerCase(); if (!trecho) throw new Error("trecho obrigatório");
      const linhas = lerTexto(ARQ.registro).split("\n"); let alteradas = 0;
      const novas = linhas.map(l => (l.includes("[PENDENTE]") && l.toLowerCase().includes(trecho)) ? (alteradas++, l.replace("[PENDENTE]", `[${input.status}]`)) : l);
      if (!alteradas) return `Nenhuma recomendação PENDENTE contém "${input.trecho}". Pendentes: ${linhas.filter(l => l.includes("[PENDENTE]")).map(l => l.replace(/^- \[PENDENTE\] /, "")).join(" | ") || "nenhuma"}`;
      fs.writeFileSync(ARQ.registro, novas.join("\n"));
      const d = lerDados(); if (Array.isArray(d.pendentes7dias)) { const antes = d.pendentes7dias.length; d.pendentes7dias = d.pendentes7dias.filter(p => !p.toLowerCase().includes(trecho)); if (d.pendentes7dias.length !== antes) gravarJson(ARQ.dados, d); }
      return `${alteradas} recomendação(ões) marcada(s) como ${input.status}.`;
    }
    case "adicionar_faq": {
      const faq = lerTexto(ARQ.faq); const ids = [...faq.matchAll(/## FAQ-(\d{3})/g)].map(m => +m[1]); const prox = String((ids.length ? Math.max(...ids) : 0) + 1).padStart(3, "0");
      const entrada = `\n## FAQ-${prox} · ${input.assunto.trim()}\n**Perguntas típicas:** ${input.perguntas.map(p => `"${p.trim()}"`).join(", ")}\n**Resposta:**\n> ${input.resposta.trim().replace(/\n/g, "\n> ")}\n**Não:** ${(input.nao || "se envolver dinheiro, reembolso ou jurídico, escalar.").trim()}\n`;
      const marcador = "<!-- Adicione novas entradas abaixo";
      fs.writeFileSync(ARQ.faq, faq.includes(marcador) ? faq.replace(marcador, entrada.trimStart() + "\n" + marcador) : faq + entrada);
      return `Entrada FAQ-${prox} adicionada: ${input.assunto}.`;
    }
    case "atualizar_objetivo": {
      const d = lerDados(); const mud = [];
      if (typeof input.alvo === "number") { d.objetivoPrincipal.alvo = input.alvo; mud.push(`alvo=${input.alvo}`); }
      if (input.prazo) { if (!/^\d{4}-\d{2}-\d{2}$/.test(input.prazo)) throw new Error("prazo deve ser AAAA-MM-DD"); d.objetivoPrincipal.prazo = input.prazo; mud.push(`prazo=${input.prazo}`); }
      if (input.rotulo) { d.objetivoPrincipal.rotulo = input.rotulo; mud.push(`rotulo=${input.rotulo}`); }
      if (input.objetivo_texto) { d.meta.objetivo = input.objetivo_texto; mud.push(`objetivo="${input.objetivo_texto}"`); }
      if (!mud.length) return "Nenhum campo informado; nada alterado.";
      gravarJson(ARQ.dados, d); return `Objetivo atualizado: ${mud.join(", ")}. O painel recarrega os dados sozinho.`;
    }
    case "notificar_celular": { if (!input.texto) throw new Error("texto obrigatório"); return await notificarTelegram(`JARVIS: ${input.texto}`); }
    default: throw new Error(`ferramenta desconhecida: ${nome}`);
  }
}
