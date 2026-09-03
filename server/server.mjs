// =====================================================================
// JARVIS · servidor local
// - serve o repositório como site estático (painel + data/mission-data.json)
// - POST /api/chat      → resposta do Claude a uma pergunta, com os dados do painel como contexto
// - POST /api/briefing  → resumo matinal falado, gerado pelo Claude a partir de data/mission-data.json
// - GET  /api/health    → diz se há credencial configurada e qual modelo está em uso
// A chave da API fica só aqui, no processo Node. O navegador nunca a vê.
// =====================================================================
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
carregarDotEnv(path.join(here, ".env"));

const PORT = Number(process.env.JARVIS_PORT || 8080);
const MODEL = process.env.JARVIS_MODEL || "claude-opus-5";
const EFFORT = process.env.JARVIS_EFFORT || "low";
const NOME = process.env.JARVIS_NOME_USUARIO || "senhor";
let FALLBACKS = (process.env.JARVIS_FALLBACKS ?? "1") !== "0";
const DATA_FILE = path.join(ROOT, "data", "mission-data.json");
const MAX_HISTORICO = 12; // turnos mantidos por conversa (o cliente envia o histórico)

const temCredencial = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const client = new Anthropic(); // lê ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / perfil `ant auth login`

// ---------------------------------------------------------------------
// Prompt do sistema. Parte estável primeiro (cacheável), dados depois.
// ---------------------------------------------------------------------
const SISTEMA_ESTAVEL = `Você é JARVIS, o assistente pessoal de ${NOME}, falando pelo painel de controle da missão.

Estilo: português do Brasil, tom sereno e levemente britânico, direto. Suas respostas serão lidas em voz alta por síntese de fala, então:
- responda em 1 a 4 frases curtas, sem listas, sem markdown, sem emojis, sem cabeçalhos;
- escreva números por extenso quando curtos (por exemplo "mil duzentos e quarenta reais") ou em algarismos simples; nunca use "R$", "%", "·", parênteses ou abreviações;
- dirija-se a ${NOME} pelo tratamento acima, sem exagero.

Regras de verdade, sem exceção:
- todo número que você citar vem dos DADOS abaixo; nunca invente, estime ou arredonde para preencher lacunas;
- se um campo vale "INDISPONÍVEL", diga que a fonte não forneceu esse número e não o substitua por nada;
- cite a fonte e a data quando o número importa para uma decisão;
- distinga claramente projeção de valor real;
- você relata e explica; você não executa ações, não envia e-mails, não publica nada. Se pedirem, explique que o Operador faz isso mediante aprovação;
- se a pergunta não puder ser respondida com os DADOS, diga isso em uma frase e ofereça o que você tem.`;

function lerDados() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch (e) { return { erro: `mission-data.json ilegível: ${e.message}` }; }
}
function blocoDados() {
  const d = lerDados();
  return `DADOS DO PAINEL (fonte: ${d?.meta?.fonte ?? "?"}, atualizados em ${d?.meta?.atualizadoEm ?? "?"}). Hoje é ${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.\n${JSON.stringify(d, null, 1)}`;
}

// ---------------------------------------------------------------------
// Chamada ao Claude
// ---------------------------------------------------------------------
async function perguntar(messages, { maxTokens = 1024 } = {}) {
  const params = {
    model: MODEL,
    max_tokens: maxTokens,                 // respostas curtas, faladas: cap deliberadamente baixo
    output_config: { effort: EFFORT },     // low = latência menor para voz; suba para medium/high se quiser mais análise
    system: [
      { type: "text", text: SISTEMA_ESTAVEL, cache_control: { type: "ephemeral" } },
      { type: "text", text: blocoDados() },
    ],
    messages,
  };
  let resp;
  if (FALLBACKS && /^claude-(opus-5|fable-5)/.test(MODEL)) {
    // Se o modelo recusar por política, o servidor da Anthropic reexecuta em um modelo alternativo na mesma chamada (beta).
    try {
      resp = await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    } catch (e) {
      // Se a API desta conta não aceitar o parâmetro beta, desliga o recurso e segue sem ele.
      if (e instanceof Anthropic.BadRequestError && /fallback|beta/i.test(e.message)) {
        console.warn("[jarvis] fallbacks não aceitos pela API; desligando: " + e.message);
        FALLBACKS = false; resp = await client.messages.create(params);
      } else throw e;
    }
  } else {
    resp = await client.messages.create(params);
  }
  if (resp.stop_reason === "refusal") {
    return { texto: "Não posso responder a isso pelo painel, " + NOME + ".", recusa: true, modelo: resp.model };
  }
  const texto = resp.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  return { texto, modelo: resp.model, uso: resp.usage, truncado: resp.stop_reason === "max_tokens" };
}

function mensagemDeErro(e) {
  if (e instanceof Anthropic.AuthenticationError) return { status: 401, erro: "Credencial inválida. Verifique ANTHROPIC_API_KEY em server/.env." };
  if (e instanceof Anthropic.PermissionDeniedError) return { status: 403, erro: "A chave não tem permissão para este modelo." };
  if (e instanceof Anthropic.NotFoundError) return { status: 404, erro: `Modelo não encontrado: ${MODEL}. Ajuste JARVIS_MODEL.` };
  if (e instanceof Anthropic.RateLimitError) return { status: 429, erro: "Limite de requisições atingido. Tente em alguns segundos." };
  if (e instanceof Anthropic.BadRequestError) return { status: 400, erro: `Requisição inválida: ${e.message}` };
  if (e instanceof Anthropic.APIConnectionError) return { status: 502, erro: "Sem conexão com a API do Claude." };
  if (e instanceof Anthropic.APIError) return { status: e.status || 500, erro: `Erro da API (${e.status}): ${e.message}` };
  return { status: 500, erro: e.message || String(e) };
}

// ---------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------
async function apiChat(body) {
  const pergunta = String(body?.message ?? "").trim();
  if (!pergunta) return { status: 400, json: { erro: "message vazio" } };
  const historico = Array.isArray(body?.history) ? body.history
    .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_HISTORICO)
    .map(m => ({ role: m.role, content: m.content })) : [];
  if (historico.length && historico[0].role !== "user") historico.shift();
  const r = await perguntar([...historico, { role: "user", content: pergunta }]);
  return { status: 200, json: { reply: r.texto, model: r.modelo, usage: r.uso, truncated: r.truncado, refusal: r.recusa === true } };
}

async function apiBriefing() {
  const pedido = `Faça o resumo matinal falado para ${NOME}, em até 220 palavras, nesta ordem: cumprimento curto; itens urgentes de "alertas" (se houver); receita de ontem, acumulado do mês e comparação com o mês passado; anúncios com melhor e pior criativo; tráfego e variações; e-mail (resolvidos, rascunhos, escalados); situação do objetivo principal. Depois diga "As três recomendações do Conselheiro" e leia as três de "recomendacoes" com ação, evidência e o que acontece se ignorar. Termine lendo "pendentes7dias" se não estiver vazio. Prosa corrida, sem listas, pronta para ser lida em voz alta.`;
  const r = await perguntar([{ role: "user", content: pedido }], { maxTokens: 1500 });
  return { status: 200, json: { briefing: r.texto, model: r.modelo, usage: r.uso, truncated: r.truncado } };
}

function apiHealth() {
  return { status: 200, json: { ok: true, configured: temCredencial, model: MODEL, effort: EFFORT, dataFile: fs.existsSync(DATA_FILE) } };
}

// ---------------------------------------------------------------------
// Servidor HTTP (sem framework)
// ---------------------------------------------------------------------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

function lerJson(req) {
  return new Promise((res, rej) => {
    let s = ""; req.on("data", c => { s += c; if (s.length > 1e6) { rej(new Error("corpo grande demais")); req.destroy(); } });
    req.on("end", () => { try { res(s ? JSON.parse(s) : {}); } catch { rej(new Error("JSON inválido")); } });
    req.on("error", rej);
  });
}
function enviarJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function servirArquivo(res, urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel === "/") rel = "/mission-control/index.html";
  if (rel.endsWith("/")) rel += "index.html";
  const abs = path.normalize(path.join(ROOT, rel));
  // nunca serve .git, node_modules nem a pasta do servidor (onde fica o .env)
  if (!abs.startsWith(ROOT + path.sep) || /(^|\/)(\.git|node_modules|server)(\/|$)/.test(rel)) { res.writeHead(403); return res.end("proibido"); }
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end("não encontrado"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(abs).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url || "/";
  try {
    if (url.startsWith("/api/")) {
      // Só aceita chamadas da própria origem (o painel servido por este servidor).
      const origem = req.headers.origin; const host = req.headers.host;
      if (origem && host && new URL(origem).host !== host) return enviarJson(res, 403, { erro: "origem não permitida" });
      if (url === "/api/health" && req.method === "GET") { const r = apiHealth(); return enviarJson(res, r.status, r.json); }
      if (req.method !== "POST") return enviarJson(res, 405, { erro: "use POST" });
      if (!temCredencial) return enviarJson(res, 503, { erro: "Sem credencial. Defina ANTHROPIC_API_KEY em server/.env (veja .env.example)." });
      const body = await lerJson(req);
      const r = url === "/api/chat" ? await apiChat(body) : url === "/api/briefing" ? await apiBriefing() : { status: 404, json: { erro: "rota desconhecida" } };
      return enviarJson(res, r.status, r.json);
    }
    return servirArquivo(res, url);
  } catch (e) {
    const m = mensagemDeErro(e);
    console.error(`[jarvis] ${req.method} ${url} → ${m.status}: ${m.erro}`);
    return enviarJson(res, m.status, { erro: m.erro });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`JARVIS online em http://localhost:${PORT}/mission-control/`);
  console.log(`  modelo: ${MODEL} · effort: ${EFFORT} · fallbacks: ${FALLBACKS ? "ativos" : "desligados"}`);
  console.log(`  credencial: ${temCredencial ? "encontrada no ambiente" : "AUSENTE — o painel funciona em modo local; copie server/.env.example para server/.env"}`);
  console.log(`  dados: ${fs.existsSync(DATA_FILE) ? DATA_FILE : "data/mission-data.json NÃO encontrado"}`);
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
