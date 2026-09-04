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
import { capacidades, ferramentaWeb, custoEstimado, MODELO_PADRAO } from "./modelos.mjs";
import { ROOT, ARQ, FERRAMENTAS_LOCAIS, FERRAMENTA_TELEGRAM, telegramConfigurado, notificarTelegram, executarFerramenta, lerTexto, lerDados, mtime, listarBriefings, lerLembretes, gravarLembretes } from "./ferramentas.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
carregarDotEnv(path.join(here, ".env"));

const PORT = Number(process.env.JARVIS_PORT || 8080);
const MODEL = process.env.JARVIS_MODEL || MODELO_PADRAO;                 // conversa do dia a dia
const MODEL_BRIEFING = process.env.JARVIS_MODEL_BRIEFING || MODEL;       // resumo matinal (pode ser um modelo mais forte)
const STT = { modo: (process.env.JARVIS_STT || "navegador").toLowerCase(),  // navegador | openai | local
  openaiKey: process.env.OPENAI_API_KEY || "", openaiBase: process.env.OPENAI_API_BASE || "https://api.openai.com", openaiModelo: process.env.OPENAI_STT_MODEL || "whisper-1",
  cmd: process.env.WHISPER_CMD || "", idioma: process.env.JARVIS_STT_IDIOMA || "pt" };
const sttConfigurado = () => STT.modo === "openai" ? Boolean(STT.openaiKey) : STT.modo === "local" ? Boolean(STT.cmd) : false;
const EFFORT = process.env.JARVIS_EFFORT || "medium";
const NOME = process.env.JARVIS_NOME_USUARIO || "senhor";
const MAX_ITERACOES = 8;                  // limite de rodadas de ferramentas por pergunta
const MAX_TURNOS_SESSAO = 60;             // acima disso a sessão recomeça (histórico é só de acréscimos)

const recursos = {                        // recursos opcionais; desligam sozinhos se a API desta conta rejeitar
  fallbacks: (process.env.JARVIS_FALLBACKS ?? "1") !== "0",
  bindingControls: true,
  webSearch: (process.env.JARVIS_WEB_SEARCH ?? "1") !== "0",
};
const SESSOES_DIR = path.join(ROOT, "data", "sessoes");   // sessões persistem entre recargas e reinícios (gitignored)
const ELEVEN = {                                           // voz do ElevenLabs; sem chave, o painel usa a voz do navegador
  key: process.env.ELEVENLABS_API_KEY || "", voz: process.env.ELEVENLABS_VOICE_ID || "", modelo: process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5",
  base: process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io",
};
const ttsConfigurado = () => Boolean(ELEVEN.key && ELEVEN.voz);

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
function novaSessao(id, model = MODEL) {
  const s = {
    id, model, criadaEm: Date.now(), dadosMtime: mtime(ARQ.dados),
    system: [
      { type: "text", text: SISTEMA_ESTAVEL, cache_control: { type: "ephemeral" } },
      { type: "text", text: `${blocoMemoria()}\n\n${blocoContexto()}\n\n${blocoDados()}` },
    ],
    tools: [...FERRAMENTAS_LOCAIS, ...(telegramConfigurado() ? [FERRAMENTA_TELEGRAM] : []), ...(recursos.webSearch ? [ferramentaWeb(model)] : [])],
    messages: [],
  };
  sessoes.set(id, s); return s;
}
const idSeguro = id => /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
function arquivoSessao(id) { return path.join(SESSOES_DIR, id + ".json"); }
function salvarSessao(s) { try { fs.mkdirSync(SESSOES_DIR, { recursive: true }); fs.writeFileSync(arquivoSessao(s.id), JSON.stringify(s)); } catch (e) { console.warn("[jarvis] não consegui salvar a sessão:", e.message); } }
function carregarSessao(id) { try { const s = JSON.parse(fs.readFileSync(arquivoSessao(id), "utf8")); if (s && Array.isArray(s.messages) && s.system && s.tools && s.model === MODEL) return s; } catch {} return null; }  // modelo diferente → sessão nova (blocos de raciocínio são presos ao modelo)
function apagarSessao(id) { sessoes.delete(id); try { fs.unlinkSync(arquivoSessao(id)); } catch {} }
function obterSessao(id) {
  id = idSeguro(String(id || "")) || randomUUID();
  let s = sessoes.get(id) || carregarSessao(id);
  if (s && !sessoes.has(s.id)) sessoes.set(id, s);
  if (!s || s.messages.length > MAX_TURNOS_SESSAO || Date.now() - s.criadaEm > 12 * 3600e3) s = novaSessao(id);
  return s;
}
// Se os dados mudaram desde o início da sessão, entra como mensagem de sistema (acréscimo, não edição).
function atualizacaoDeDados(s) {
  const m = mtime(ARQ.dados); if (m === s.dadosMtime) return null;
  s.dadosMtime = m; return `Atualização: o arquivo de dados mudou. Use esta versão a partir de agora.\n${blocoDados()}`;
}

// =====================================================================
// 4. LOOP AGÊNTICO EM STREAMING
// =====================================================================
function paramsBase(s) {
  const cap = capacidades(s.model);
  const p = { model: s.model, max_tokens: 2048, system: s.system, tools: s.tools, messages: s.messages };
  if (cap.effort) p.output_config = { effort: EFFORT };
  const betas = [];
  if (recursos.fallbacks && cap.fallbacks) { betas.push("server-side-fallback-2026-07-01"); p.fallbacks = "default"; }
  if (cap.binding && recursos.bindingControls) { betas.push("thinking-binding-controls-2026-08-01"); p.thinking = { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } }; }
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
      if (recursos.webSearch && /web_search/i.test(msg)) { console.warn("[jarvis] web_search rejeitado; desligando:", msg); recursos.webSearch = false; s.tools = s.tools.filter(t => t.name !== "web_search"); continue; }
      if (/signature|thinking/i.test(msg)) { console.warn("[jarvis] blocos de raciocínio inválidos; removendo do histórico:", msg); s.messages = semThinking(s.messages); continue; }
      throw e;
    }
  }
  throw new Error("não foi possível completar a chamada após degradações sucessivas");
}

async function conversar(s, textoUsuario, emitir) {
  const upd = atualizacaoDeDados(s);
  if (upd && capacidades(s.model).sistemaMeioDaConversa) { s.messages.push({ role: "user", content: textoUsuario }, { role: "system", content: upd }); }
  else if (upd) { s.messages.push({ role: "user", content: [{ type: "text", text: upd }, { type: "text", text: textoUsuario }] }); }  // modelos sem system no meio: vai junto do turno do usuário
  else s.messages.push({ role: "user", content: textoUsuario });
  const uso = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const ferramentasUsadas = []; let textoFinal = ""; let modelo = s.model; let truncado = false;

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
  for (const l of todos) if (!l.disparado && new Date(l.quando) <= Date.now()) {
    l.disparado = true; l.disparadoEm = new Date().toISOString(); mudou = true;
    difundir("lembrete", { id: l.id, texto: l.texto, quando: l.quando }); console.log(`[jarvis] lembrete disparado: ${l.texto}`);
    if (telegramConfigurado()) notificarTelegram(`⏰ Lembrete: ${l.texto}`).catch(e => console.warn("[jarvis] telegram:", e.message));
  }
  if (mudou) gravarLembretes(todos);
}, 10000);
let ultimoMtimeDados = mtime(ARQ.dados);
setInterval(() => {
  const m = mtime(ARQ.dados); if (m === ultimoMtimeDados) return;
  ultimoMtimeDados = m; const d = lerDados();
  difundir("dados", { fonte: d?.meta?.fonte, atualizadoEm: d?.meta?.atualizadoEm, alertas: d?.alertas?.length ?? 0 });
  // alertas novos do Explorador vão para o celular (só quando a fonte é REAL, para não notificar dados simulados)
  if (telegramConfigurado() && d?.meta?.fonte === "REAL" && Array.isArray(d.alertas) && d.alertas.length)
    notificarTelegram(`🛰 Explorador · ${d.alertas.length} alerta(s):\n• ` + d.alertas.join("\n• ")).catch(e => console.warn("[jarvis] telegram:", e.message));
}, 5000);
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
function lerBruto(req) {
  return new Promise((res, rej) => {
    const partes = []; let tam = 0;
    req.on("data", c => { partes.push(c); tam += c.length; if (tam > 15e6) { rej(new Error("áudio grande demais")); req.destroy(); } });
    req.on("end", () => res({ audio: Buffer.concat(partes), tipo: req.headers["content-type"] || "audio/webm" }));
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
// Transcrição (Whisper). "openai": API de áudio da OpenAI. "local": comando externo (whisper.cpp etc.) via WHISPER_CMD com {arquivo}.
async function apiStt(res, { audio, tipo }) {
  if (!sttConfigurado()) return enviarJson(res, 404, { erro: "transcrição não configurada (JARVIS_STT)" });
  if (!audio || audio.length < 800) return enviarJson(res, 400, { erro: "áudio vazio" });
  const ext = /ogg/.test(tipo) ? "ogg" : /mp4|m4a/.test(tipo) ? "m4a" : /wav/.test(tipo) ? "wav" : /mpeg|mp3/.test(tipo) ? "mp3" : "webm";
  if (STT.modo === "openai") {
    const fd = new FormData(); fd.append("file", new Blob([audio], { type: tipo.split(";")[0] }), `fala.${ext}`); fd.append("model", STT.openaiModelo); fd.append("language", STT.idioma); fd.append("response_format", "json");
    const r = await fetch(`${STT.openaiBase}/v1/audio/transcriptions`, { method: "POST", headers: { authorization: `Bearer ${STT.openaiKey}` }, body: fd });
    if (!r.ok) { const t = await r.text().catch(() => ""); console.warn(`[jarvis] stt openai ${r.status}: ${t.slice(0, 160)}`); return enviarJson(res, 502, { erro: `transcrição HTTP ${r.status}` }); }
    const j = await r.json(); return enviarJson(res, 200, { texto: String(j.text || "").trim(), provedor: "openai" });
  }
  // local
  const os = await import("node:os"); const { execFile, spawn } = await import("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-stt-")); const bruto = path.join(dir, `fala.${ext}`); fs.writeFileSync(bruto, audio);
  let entrada = bruto;
  const temFfmpeg = await new Promise(r => execFile("ffmpeg", ["-version"], e => r(!e)));
  if (temFfmpeg) { const wav = path.join(dir, "fala.wav"); await new Promise((r, j) => execFile("ffmpeg", ["-y", "-loglevel", "error", "-i", bruto, "-ar", "16000", "-ac", "1", wav], e => e ? j(e) : r())).then(() => { entrada = wav; }).catch(e => console.warn("[jarvis] ffmpeg:", e.message)); }
  const cmd = STT.cmd.replaceAll("{arquivo}", JSON.stringify(entrada)).replaceAll("{idioma}", STT.idioma);
  const saida = await new Promise((r, j) => { const p = spawn(cmd, { shell: true }); let out = "", err = ""; p.stdout.on("data", d => out += d); p.stderr.on("data", d => err += d); p.on("close", c => c === 0 ? r(out) : j(new Error(`WHISPER_CMD saiu com ${c}: ${err.slice(0, 200)}`))); });
  fs.rmSync(dir, { recursive: true, force: true });
  const texto = saida.split("\n").map(l => l.replace(/^\[[^\]]*\]\s*/, "").trim()).filter(Boolean).join(" ").trim();  // remove marcas de tempo do whisper.cpp
  return enviarJson(res, 200, { texto, provedor: "local" });
}

async function apiTts(res, texto) {
  if (!ttsConfigurado()) return enviarJson(res, 404, { erro: "ElevenLabs não configurado" });
  texto = texto.trim().slice(0, 1200); if (!texto) return enviarJson(res, 400, { erro: "texto vazio" });
  const r = await fetch(`${ELEVEN.base}/v1/text-to-speech/${encodeURIComponent(ELEVEN.voz)}/stream?output_format=mp3_44100_128`, {
    method: "POST", headers: { "xi-api-key": ELEVEN.key, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text: texto, model_id: ELEVEN.modelo }),
  });
  if (!r.ok) { const t = await r.text().catch(() => ""); console.warn(`[jarvis] elevenlabs ${r.status}: ${t.slice(0, 160)}`); return enviarJson(res, 502, { erro: `ElevenLabs HTTP ${r.status}` }); }
  res.writeHead(200, { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" });
  for await (const chunk of r.body) res.write(chunk);
  res.end();
}

const PEDIDO_BRIEFING = `Faça o resumo matinal falado, em até duzentas e cinquenta palavras, nesta ordem: cumprimento curto; itens urgentes de alertas, se houver; receita de ontem, acumulado do mês e comparação com o mês passado; anúncios com melhor e pior criativo; tráfego e variações; e-mail com resolvidos, rascunhos e escalados; situação do objetivo principal; lembretes pendentes de hoje, se houver. Depois diga "As três recomendações do Conselheiro" e leia as três com ação, evidência e o que acontece se ignorar. Termine lendo as pendências de sete dias, se existirem. Se houver um briefing do Explorador de hoje em data/briefings, leia-o antes e use os detalhes dele. Prosa corrida, pronta para voz.`;

const server = http.createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];
  try {
    if (url.startsWith("/api/")) {
      const origem = req.headers.origin; const host = req.headers.host;
      if (origem && host && new URL(origem).host !== host) return enviarJson(res, 403, { erro: "origem não permitida" });
      if (url === "/api/health" && req.method === "GET")
        return enviarJson(res, 200, { ok: true, configured: temCredencial, model: MODEL, modelBriefing: MODEL_BRIEFING, stt: sttConfigurado() ? STT.modo : "navegador", effort: EFFORT, tools: FERRAMENTAS_LOCAIS.map(t => t.name).concat(telegramConfigurado() ? ["notificar_celular"] : [], recursos.webSearch ? ["web_search"] : []), streaming: true, tts: ttsConfigurado(), telegram: telegramConfigurado(), dataFile: fs.existsSync(ARQ.dados) });
      if (url === "/api/eventos" && req.method === "GET") { abrirSSE(res); clientesSSE.add(res); req.on("close", () => clientesSSE.delete(res)); return; }
      if (req.method !== "POST") return enviarJson(res, 405, { erro: "use POST" });
      if (!temCredencial) return enviarJson(res, 503, { erro: "Sem credencial. Defina ANTHROPIC_API_KEY em server/.env (veja .env.example)." });
      const body = url === "/api/stt" ? await lerBruto(req) : await lerJson(req);
      if (url === "/api/session/reset") { const id = idSeguro(String(body.sessionId || "")); if (id) apagarSessao(id); return enviarJson(res, 200, { ok: true }); }
      if (url === "/api/tts") return await apiTts(res, String(body.texto || ""));
      if (url === "/api/stt") return await apiStt(res, body);
      if (url !== "/api/chat" && url !== "/api/briefing") return enviarJson(res, 404, { erro: "rota desconhecida" });
      const texto = url === "/api/briefing" ? PEDIDO_BRIEFING : String(body.message ?? "").trim();
      if (!texto) return enviarJson(res, 400, { erro: "message vazio" });
      // o resumo matinal pode usar um modelo mais forte; nesse caso roda em sessão própria, não persistida
      const s = (url === "/api/briefing" && MODEL_BRIEFING !== MODEL) ? novaSessao("briefing-" + randomUUID().slice(0, 8), MODEL_BRIEFING) : obterSessao(body.sessionId);
      const emitir = abrirSSE(res);
      try {
        const r = await conversar(s, texto, emitir);
        if (s.model === MODEL) salvarSessao(s); else sessoes.delete(s.id);
        emitir("done", { model: r.modelo, usage: r.uso, custo_usd: custoEstimado(r.modelo, r.uso), tools: r.ferramentasUsadas, truncated: r.truncado === true, refusal: r.recusa === true, texto: r.texto ?? "" });
      } catch (e) {
        const m = mensagemDeErro(e); console.error(`[jarvis] POST ${url} → ${m.status}: ${m.erro}`);
        // devolve a sessão a um estado consistente: remove o turno do usuário sem resposta
        while (s.messages.length && s.messages[s.messages.length - 1].role !== "assistant") s.messages.pop();
        salvarSessao(s);
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
  console.log(`  modelo: ${MODEL}${MODEL_BRIEFING !== MODEL ? " · resumo matinal: " + MODEL_BRIEFING : ""} · effort: ${EFFORT} · fallbacks: ${recursos.fallbacks && capacidades(MODEL).fallbacks ? "ativos" : "n/a"} · web search: ${recursos.webSearch ? "ativa" : "desligada"}`);
  console.log(`  transcrição: ${sttConfigurado() ? STT.modo : "navegador"}${STT.modo !== "navegador" && !sttConfigurado() ? " (JARVIS_STT=" + STT.modo + " mas falta " + (STT.modo === "openai" ? "OPENAI_API_KEY" : "WHISPER_CMD") + ")" : ""}`);
  console.log(`  ferramentas locais: ${FERRAMENTAS_LOCAIS.map(t => t.name).join(", ")}${telegramConfigurado() ? ", notificar_celular" : ""}`);
  console.log(`  voz: ${ttsConfigurado() ? "ElevenLabs (" + ELEVEN.modelo + ")" : "navegador"} · telegram: ${telegramConfigurado() ? "ativo" : "não configurado"} · sessões: ${SESSOES_DIR}`);
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
