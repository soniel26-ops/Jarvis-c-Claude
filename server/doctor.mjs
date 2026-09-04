// =====================================================================
// JARVIS · diagnóstico  (npm run doctor)
// Verifica a máquina, os arquivos, as ferramentas locais e, se houver
// chave, faz UMA chamada real e pequena à API do Claude com os mesmos
// parâmetros do servidor. Relata o que a sua conta aceitou ou rejeitou.
//   node doctor.mjs            → tudo
//   node doctor.mjs --sem-api  → só verificações locais (não gasta nada)
// =====================================================================
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { ROOT, ARQ, FERRAMENTAS_LOCAIS, executarFerramenta, lerDados } from "./ferramentas.mjs";
import { capacidades, ferramentaWeb, custoEstimado, MODELO_PADRAO, PRECO } from "./modelos.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
carregarDotEnv(path.join(here, ".env"));
const SEM_API = process.argv.includes("--sem-api");
const MODEL = process.env.JARVIS_MODEL || MODELO_PADRAO;
const PORT = Number(process.env.JARVIS_PORT || 8080);

const linhas = []; let falhas = 0, avisos = 0;
const ok = (t, d = "") => linhas.push(["✔", t, d]);
const aviso = (t, d = "") => { avisos++; linhas.push(["⚠", t, d]); };
const falha = (t, d = "") => { falhas++; linhas.push(["✘", t, d]); };
const proximos = [];

// ---------------------------------------------------------------- 1. máquina
const [maj] = process.versions.node.split(".").map(Number);
maj >= 20 ? ok(`Node.js ${process.versions.node}`) : falha(`Node.js ${process.versions.node}`, "precisa ser 20 ou mais novo: https://nodejs.org");
try { ok("Git " + execSync("git --version", { stdio: "pipe" }).toString().trim().replace("git version ", "")); } catch { aviso("Git não encontrado", "necessário para sincronizar dados e para os agentes"); }
try { const v = execSync("claude --version", { stdio: "pipe" }).toString().trim(); ok("Claude Code CLI " + v, "necessário só para rodar os agentes pela sua máquina (Fase 4, opção B)"); }
catch { aviso("Claude Code CLI (claude) não encontrado", "só importa para a Fase 4 opção B: npm i -g @anthropic-ai/claude-code"); }

// ---------------------------------------------------------------- 2. configuração
const envPath = path.join(here, ".env");
if (fs.existsSync(envPath)) ok("server/.env existe"); else { falha("server/.env não existe", "cp .env.example .env e preencha ANTHROPIC_API_KEY"); proximos.push("Criar server/.env a partir de .env.example"); }
const chave = process.env.ANTHROPIC_API_KEY || "";
if (chave) { chave.startsWith("sk-ant-") ? ok("ANTHROPIC_API_KEY presente", chave.slice(0, 10) + "…" + chave.slice(-4)) : aviso("ANTHROPIC_API_KEY presente mas não começa com sk-ant-", "confira se copiou a chave inteira"); }
else if (process.env.ANTHROPIC_AUTH_TOKEN) ok("ANTHROPIC_AUTH_TOKEN presente");
else { falha("Nenhuma credencial", "sem ela o painel funciona só em modo local"); proximos.push("Colar a chave em server/.env → ANTHROPIC_API_KEY="); }
{ const [pi, po] = PRECO[MODEL] || [0, 0]; (PRECO[MODEL] ? ok : aviso)(`Modelo configurado: ${MODEL}`, `US$ ${pi}/${po} por milhão de tokens (entrada/saída) · effort ${process.env.JARVIS_EFFORT || "medium"} · web search ${(process.env.JARVIS_WEB_SEARCH ?? "1") !== "0" ? "ligada" : "desligada"}${PRECO[MODEL] ? "" : " · modelo fora da tabela conhecida"}`);
  if (process.env.JARVIS_MODEL_BRIEFING && process.env.JARVIS_MODEL_BRIEFING !== MODEL) ok(`Resumo matinal com ${process.env.JARVIS_MODEL_BRIEFING}`);
  const stt = (process.env.JARVIS_STT || "navegador").toLowerCase();
  if (stt === "openai") process.env.OPENAI_API_KEY ? ok("Transcrição: Whisper pela API da OpenAI") : falha("JARVIS_STT=openai sem OPENAI_API_KEY");
  else if (stt === "local") { process.env.WHISPER_CMD ? ok("Transcrição: Whisper local", process.env.WHISPER_CMD) : falha("JARVIS_STT=local sem WHISPER_CMD"); try { execSync("ffmpeg -version", { stdio: "pipe" }); ok("ffmpeg encontrado (converte o áudio do navegador para WAV 16 kHz)"); } catch { aviso("ffmpeg não encontrado", "o whisper.cpp precisa de WAV; instale o ffmpeg"); } }
  else ok("Transcrição: reconhecimento do navegador");
  const host = process.env.JARVIS_HOST || "127.0.0.1", token = process.env.JARVIS_TOKEN || "";
  if (host !== "127.0.0.1" && host !== "localhost" && !token) falha(`JARVIS_HOST=${host} sem JARVIS_TOKEN`, "expor na rede exige token; o servidor se recusa a iniciar");
  else if (token) { token.length >= 12 ? ok(`Login por token ativo${host !== "127.0.0.1" ? " · escutando em " + host : ""}`) : aviso("JARVIS_TOKEN curto", "use 12+ caracteres: openssl rand -hex 16"); }
  else ok("Sem login: só esta máquina (127.0.0.1)");
  if (process.env.JARVIS_TLS_CERT || process.env.JARVIS_TLS_KEY) { (fs.existsSync(process.env.JARVIS_TLS_CERT || "") && fs.existsSync(process.env.JARVIS_TLS_KEY || "")) ? ok("HTTPS: certificado e chave encontrados") : falha("HTTPS: JARVIS_TLS_CERT/KEY apontam para arquivos inexistentes", "scripts/gerar-certificado.sh"); }
  else if (host !== "127.0.0.1") aviso("Rede local sem HTTPS", "o microfone não funciona em http fora do localhost; rode scripts/gerar-certificado.sh");
  const fontes = [process.env.STRIPE_SECRET_KEY && "Stripe", process.env.REVENUECAT_API_KEY && process.env.REVENUECAT_PROJECT_ID && "RevenueCat", process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID && "Meta Ads", fs.existsSync(path.join(ROOT, "data", "fontes.json")) && "data/fontes.json"].filter(Boolean);
  fontes.length ? ok("Fontes ao vivo: " + fontes.join(", "), `coleta a cada ${process.env.JARVIS_FONTES_INTERVALO_MIN || 30} min`) : aviso("Nenhuma fonte ao vivo configurada", "os dados vêm do Explorador (Fase 4) ou ficam simulados"); }

// ---------------------------------------------------------------- 3. arquivos
const d = lerDados();
if (d.erro) falha("data/mission-data.json", d.erro);
else {
  const faltam = ["meta", "objetivoPrincipal", "receita", "anuncios", "trafego", "email", "recomendacoes", "pendentes7dias"].filter(k => !(k in d));
  faltam.length ? falha("data/mission-data.json incompleto", "faltam: " + faltam.join(", ")) : ok("data/mission-data.json válido", `fonte ${d.meta.fonte} · atualizado ${d.meta.atualizadoEm}`);
  if (d.meta.fonte === "SIMULADO") aviso("Dados ainda SIMULADOS", "o Explorador troca para REAL quando rodar (Fase 4)");
}
for (const [rot, p] of [["data/memoria.md", ARQ.memoria], ["data/lembretes.json", ARQ.lembretes], ["data/registro-recomendacoes.md", ARQ.registro], ["conhecimento/faq.md", ARQ.faq]])
  fs.existsSync(p) ? ok(rot) : falha(rot + " não existe", "recrie a partir do repositório (git checkout -- " + rot + ")");
try { JSON.parse(fs.readFileSync(ARQ.lembretes, "utf8")); } catch (e) { falha("data/lembretes.json inválido", e.message); }
const faq = fs.existsSync(ARQ.faq) ? fs.readFileSync(ARQ.faq, "utf8") : "";
if (/FAQ-001 · Como cancelar a assinatura/.test(faq)) aviso("FAQ ainda é o exemplo", "Fase 3: escreva as perguntas reais dos seus clientes");
if (fs.existsSync(ARQ.memoria) && /Exemplo: prefiro o resumo matinal curto/.test(fs.readFileSync(ARQ.memoria, "utf8"))) aviso("Memória ainda tem a linha de exemplo", "apague-a em data/memoria.md");
for (const a of ["explorador", "operador", "conselheiro"]) fs.existsSync(path.join(ROOT, "agents", a + ".md")) ? ok(`agents/${a}.md`) : falha(`agents/${a}.md ausente`);
fs.existsSync(path.join(ROOT, "mission-control", "index.html")) ? ok("mission-control/index.html") : falha("painel ausente");

// ---------------------------------------------------------------- 4. porta
await new Promise(res => { const srv = net.createServer(); srv.once("error", e => { e.code === "EADDRINUSE" ? aviso(`Porta ${PORT} ocupada`, "o servidor já está rodando, ou outro programa usa a porta (mude JARVIS_PORT)") : aviso(`Porta ${PORT}: ${e.code}`); res(); }); srv.listen(PORT, "127.0.0.1", () => { ok(`Porta ${PORT} livre`); srv.close(res); }); });

// ---------------------------------------------------------------- 5. ferramentas locais (só leitura, nada é gravado)
const testes = [
  ["listar_briefings", {}], ["memoria", { acao: "listar" }], ["lembrete", { acao: "listar" }],
  ["ler_arquivo", { caminho: "README.md" }], ["ler_arquivo", { caminho: "../server/.env" }, true],
];
for (const [nome, input, deveFalhar] of testes) {
  try { const r = await executarFerramenta(nome, input); deveFalhar ? falha(`ferramenta ${nome} leu caminho proibido`, String(r).slice(0, 60)) : ok(`ferramenta ${nome}`, String(r).split("\n")[0].slice(0, 70)); }
  catch (e) { deveFalhar ? ok(`ferramenta ${nome} bloqueou leitura fora da área permitida`) : falha(`ferramenta ${nome}`, e.message); }
}

// ---------------------------------------------------------------- 6. API real (uma chamada pequena)
const relatorioApi = [];
if (SEM_API) aviso("Teste da API pulado (--sem-api)");
else if (!chave && !process.env.ANTHROPIC_AUTH_TOKEN) aviso("Teste da API pulado", "sem credencial");
else {
  const client = new Anthropic();
  const cap = capacidades(MODEL); const ehFable = cap.fable;
  const rec = { fallbacks: (process.env.JARVIS_FALLBACKS ?? "1") !== "0" && cap.fallbacks, binding: cap.binding, web: (process.env.JARVIS_WEB_SEARCH ?? "1") !== "0" };
  const params = () => {
    const p = { model: MODEL, max_tokens: 400, system: "Responda apenas com a palavra: ok",
      tools: [...FERRAMENTAS_LOCAIS, ...(rec.web ? [ferramentaWeb(MODEL)] : [])], messages: [{ role: "user", content: "Teste de conexão. Responda apenas: ok" }] };
    if (cap.effort) p.output_config = { effort: "low" };
    const betas = [];
    if (rec.fallbacks) { betas.push("server-side-fallback-2026-07-01"); p.fallbacks = "default"; }
    if (rec.binding) { betas.push("thinking-binding-controls-2026-08-01"); p.thinking = { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } }; }
    if (betas.length) p.betas = betas; return p;
  };
  let resp = null, t0 = Date.now();
  for (let i = 0; i < 4 && !resp; i++) {
    try { resp = await client.beta.messages.create(params()); }
    catch (e) {
      if (e instanceof Anthropic.BadRequestError) {
        const m = e.message || "";
        if (rec.fallbacks && /fallback/i.test(m)) { rec.fallbacks = false; relatorioApi.push(["⚠", "fallbacks (beta) rejeitados pela sua conta", "o servidor desliga sozinho; para não tentar de novo: JARVIS_FALLBACKS=0"]); continue; }
        if (rec.binding && /binding/i.test(m)) { rec.binding = false; relatorioApi.push(["⚠", "thinking-binding-controls (beta) rejeitado", "o servidor desliga sozinho"]); continue; }
        if (rec.web && /web_search/i.test(m)) { rec.web = false; relatorioApi.push(["⚠", "web_search rejeitada para este modelo/conta", "para não tentar de novo: JARVIS_WEB_SEARCH=0"]); continue; }
        relatorioApi.push(["✘", "Requisição inválida", m.slice(0, 200)]); break;
      }
      if (e instanceof Anthropic.AuthenticationError) { relatorioApi.push(["✘", "Chave inválida (401)", "confira ANTHROPIC_API_KEY"]); proximos.push("Gerar uma chave nova em console.anthropic.com e colar no .env"); break; }
      if (e instanceof Anthropic.PermissionDeniedError) { relatorioApi.push(["✘", `Sem permissão para ${MODEL} (403)`, "tente JARVIS_MODEL=claude-opus-5"]); break; }
      if (e instanceof Anthropic.NotFoundError) { relatorioApi.push(["✘", `Modelo não encontrado: ${MODEL} (404)`, "tente JARVIS_MODEL=claude-opus-5"]); break; }
      if (e instanceof Anthropic.RateLimitError) { relatorioApi.push(["✘", "Limite de requisições (429)", "espere e repita"]); break; }
      if (e instanceof Anthropic.APIConnectionError) { relatorioApi.push(["✘", "Sem conexão com api.anthropic.com", "rede, proxy ou firewall"]); break; }
      relatorioApi.push(["✘", "Erro da API", (e.status || "") + " " + (e.message || e)]); break;
    }
  }
  if (resp) {
    const ms = Date.now() - t0;
    const texto = resp.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
    const u = resp.usage || {}; const custo = custoEstimado(resp.model in PRECO ? resp.model : MODEL, u);
    relatorioApi.unshift(["✔", `API respondeu com ${resp.model} em ${ms} ms`, `resposta: "${texto.slice(0, 40)}" · stop ${resp.stop_reason} · ${u.input_tokens} in / ${u.output_tokens} out · ≈ US$ ${custo.toFixed(4)}`]);
    if (resp.stop_reason === "refusal") relatorioApi.push(["⚠", "A chamada de teste foi recusada pelo classificador", "improvável em uso normal; veja stop_details no log"]);
    if (cap.fallbacks) relatorioApi.push([rec.fallbacks ? "✔" : "⚠", `fallbacks de recusa: ${rec.fallbacks ? "aceitos" : "indisponíveis"}`]);
    if (ehFable) relatorioApi.push([rec.binding ? "✔" : "⚠", `controle de blocos de raciocínio: ${rec.binding ? "aceito" : "indisponível"}`]);
    relatorioApi.push([rec.web ? "✔" : "⚠", `web_search: ${rec.web ? "aceita" : "indisponível"}`]);
  }
}

// ---------------------------------------------------------------- relatório
const linha = (s, t, dd) => console.log(`  ${s}  ${t}${dd ? "\n       " + dd : ""}`);
console.log("\nJARVIS · DIAGNÓSTICO\n");
console.log("Máquina, configuração, arquivos e ferramentas:");
for (const [s, t, dd] of linhas) linha(s, t, dd);
console.log("\nAPI do Claude:");
if (relatorioApi.length) for (const [s, t, dd] of relatorioApi) linha(s, t, dd); else linha("·", "não testada");
const falhasApi = relatorioApi.filter(r => r[0] === "✘").length;
console.log(`\nResumo: ${falhas + falhasApi} falha(s) · ${avisos + relatorioApi.filter(r => r[0] === "⚠").length} aviso(s)`);
if (proximos.length) { console.log("Próximos passos:"); for (const p of proximos) console.log("  → " + p); }
else if (!falhas && !falhasApi) console.log("Tudo pronto para: cd server && npm start  →  http://localhost:" + PORT + "/mission-control/");
console.log();
process.exit(falhas + falhasApi ? 1 : 0);

function carregarDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const l of fs.readFileSync(file, "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*(#.*)?$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2"); }
}
