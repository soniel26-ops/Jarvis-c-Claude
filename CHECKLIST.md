# Checklist · JARVIS 100% operacional no seu computador

Marque cada item ao concluir. As fases estão em ordem de dependência: não pule.
Estado do que já existe no repositório: painel, servidor agêntico, prompts dos agentes e scripts de instalação, diagnóstico, agendamento e serviço, todos testados sem chave real. O que falta é o que depende da sua máquina, da sua conta e dos seus dados.

Atalho: as Fases 0, 1 e 2 são um comando só.
- macOS / Linux: `./scripts/instalar.sh`
- Windows (PowerShell): `powershell -ExecutionPolicy Bypass -File scripts\instalar.ps1`
Ele verifica Node e Git, instala, pede a chave, grava o `.env` e roda o diagnóstico (`npm run doctor`), que faz uma chamada pequena à API e diz o que a sua conta aceitou.

---

## Fase 0 · Pré-requisitos (15 min)

- [ ] **Node.js 20 ou mais novo.** `node --version` no terminal. Se não tiver: https://nodejs.org (versão LTS).
- [ ] **Git.** `git --version`. Se não tiver: https://git-scm.com.
- [ ] **Chrome ou Edge** atualizado. Firefox e Safari não têm reconhecimento de voz contínuo.
- [ ] **Microfone e alto-falantes** funcionando (o modo mãos livres precisa dos dois).
- [ ] **Conta na Anthropic com créditos.** https://console.anthropic.com → Billing. O Fable 5.1 é o modelo mais caro; comece com um crédito pequeno (por exemplo 20 dólares) e um limite de gasto mensal em Settings → Limits.
- [ ] **Chave de API criada** em console.anthropic.com → API Keys. Copie e guarde; ela só aparece uma vez.
- [ ] (Recomendado) **Defina um limite de gasto** na conta antes de qualquer teste.

## Fase 1 · Instalar e ligar (10 min)

- [ ] Clonar o repositório e entrar na branch de trabalho:
  ```bash
  git clone https://github.com/soniel26-ops/Jarvis-c-Claude.git
  cd Jarvis-c-Claude
  git checkout claude/jarvis-personal-assistant-74p9a9
  ```
- [ ] Instalar o servidor:
  ```bash
  cd server
  npm install
  cp .env.example .env
  ```
  (No Windows sem bash: `copy .env.example .env`.)
- [ ] Abrir `server/.env` e colar a chave em `ANTHROPIC_API_KEY=`. Ajustar `JARVIS_NOME_USUARIO` (como ele te chama).
- [ ] Rodar o diagnóstico: `npm run doctor` (ou `npm run doctor:local` para não gastar nada). Tudo ✔ ou ⚠ antes de seguir; ✘ traz o próximo passo na própria saída.
- [ ] Iniciar: `npm start`. O terminal deve mostrar `credencial: encontrada no ambiente`.
- [ ] Abrir http://localhost:8080/mission-control/ no Chrome ou Edge.
- [ ] Conferir no rodapé: selo **CÉREBRO** = `CLAUDE · claude-fable-5-1`. Se estiver `LOCAL`, veja o painel DIAGNÓSTICO e o terminal do servidor.
- [ ] Clicar na esfera uma vez e **permitir o microfone** quando o navegador pedir.

## Fase 2 · Primeiro contato com a API real (20 min) — isto ainda não foi testado por ninguém

Faça cada pergunta pelo campo de texto e olhe o terminal do servidor depois de cada uma.

- [ ] **`npm run doctor` com a chave no `.env`.** A seção "API do Claude" mostra se o modelo respondeu, a latência, o custo da chamada e quais recursos beta a sua conta aceitou (fallbacks, controle de blocos de raciocínio, web search). Para cada ⚠ ele diz qual variável pôr no `.env` para não repetir o erro.
- [ ] **Pergunta simples:** "como está a receita?". Deve responder com os números do painel em prosa falada.
- [ ] **Olhar o terminal do servidor.** Linhas `[jarvis] ... rejeitados; desligando` repetem o que o doctor mostrou; o servidor segue sem o recurso.
- [ ] **Memória:** "lembre que eu prefiro relatórios curtos". Conferir a linha nova em `data/memoria.md`.
- [ ] **Lembrete:** "me lembra em 1 minuto de beber água". Esperar: o painel deve falar sozinho. Conferir `data/lembretes.json`.
- [ ] **Leitura de arquivo:** "o que tem no registro de recomendações?". Ele deve ler `data/registro-recomendacoes.md`.
- [ ] **Recomendação:** "já pausei o criativo IMG-12". Conferir `[FEITO]` no registro e a lista `pendentes7dias` no `mission-data.json`.
- [ ] **FAQ:** "adiciona ao FAQ: quando perguntarem se tem desconto anual, responda que o plano anual sai com dois meses grátis". Conferir a entrada nova em `conhecimento/faq.md`.
- [ ] **Meta:** "muda a meta para quarenta mil". Conferir o cartão OBJETIVO PRINCIPAL recarregar.
- [ ] **Web:** "como está o tempo em Paris agora?". Ele deve dizer que a informação veio da web.
- [ ] **Resumo matinal:** botão ☼ RESUMO MATINAL. Deve falar o resumo completo com as três recomendações.
- [ ] **Mãos livres:** botão ◉ MÃOS LIVRES, depois falar "Jarvis, que horas são?". Depois "Jarvis" sozinho → ele diz "Sim?". Durante uma fala longa, "Jarvis, pare".
- [ ] **Custo:** abrir console.anthropic.com → Usage e ver quanto essa sessão de teste custou. Isso calibra a Fase 5.
- [ ] Reverter os testes que sujaram dados: apagar a linha de teste em `data/memoria.md`, a entrada de teste no FAQ e, se quiser, `git checkout -- data/ conhecimento/`.

## Fase 3 · Personalizar (1 a 2 horas, a parte que só você pode fazer)

- [ ] **Objetivo real.** Em `data/mission-data.json`: `meta.objetivo`, `objetivoPrincipal.alvo`, `prazo`, `rotulo`, `inicioPeriodo`. Pode pedir ao próprio JARVIS ("muda a meta para…").
- [ ] **Limpar a memória de exemplo** em `data/memoria.md` e gravar o que importa: seu nome, fuso, horário de trabalho, como prefere o resumo, o que não quer ouvir.
- [ ] **FAQ de verdade.** `conhecimento/faq.md`: apagar as 4 entradas de exemplo, escrever as 10 a 20 perguntas que seus clientes realmente repetem, com a resposta exata na sua voz. Este arquivo é o limite do Operador; quanto melhor ele, menos escalações.
- [ ] **Limites do Explorador.** Tabela no fim de `agents/explorador.md`: quais métricas e quais limiares disparam alerta no seu negócio.
- [ ] **Modo do Operador.** `agents/operador.md` deve continuar em `MODO: RASCUNHO` por pelo menos uma semana.
- [ ] **Voz.** Em `mission-control/index.html`, `CONFIG.vozPreferida` e `CONFIG.idiomaVoz`. Instale vozes pt-BR de qualidade no sistema: Windows → Configurações → Hora e idioma → Fala → Adicionar vozes; macOS → Ajustes → Acessibilidade → Conteúdo falado → Voz do sistema → Gerenciar vozes (baixe as "Aprimoradas"). Recarregue o painel e veja no DIAGNÓSTICO qual voz foi selecionada.
- [ ] **Esforço e modelo.** Se as respostas demorarem mais do que você gosta: `JARVIS_EFFORT=low`. Se o custo pesar: `JARVIS_MODEL=claude-opus-5`. Reinicie o servidor após mudar o `.env`.
- [ ] **Persona.** Se quiser mudar o tom, edite `SISTEMA_ESTAVEL` em `server/server.mjs`.

## Fase 4 · Ligar os agentes (o que ainda não roda sozinho)

Hoje os três agentes são prompts prontos em `agents/`. Eles só coletam e escrevem quando alguma coisa os executa no horário. Ainda não existe automação disso no repositório.

- [ ] **Escolher o executor.** Duas opções realistas:
  - **A · Rotinas do Claude** (claude.ai → Rotinas/tarefas agendadas, se disponíveis na sua conta): crie uma rotina por agente colando o prompt do arquivo correspondente. A rotina precisa conseguir gravar nos arquivos deste repositório: dê a ela acesso ao repositório GitHub `soniel26-ops/Jarvis-c-Claude` (ela faz commit) ou aponte a saída para uma pasta sincronizada (Google Drive, iCloud) e mude os caminhos em `server/ferramentas.mjs` (`ARQ`) e no painel (`CONFIG.arquivoDados`).
  - **B · Claude Code agendado na sua máquina (scripts prontos):** `scripts/agente.sh explorador` (ou `agente.ps1`) roda o agente pelo Claude Code, grava os arquivos e chama `sincronizar`. `scripts/agendar.sh` (ou `agendar.ps1`) instala os horários: Explorador 06:00, Conselheiro 06:20, Operador a cada 3 h das 08 às 20, sincronização 06:30. Exige `npm i -g @anthropic-ai/claude-code` + `claude login` e os conectores configurados no Claude Code como servidores MCP; liste-os em `JARVIS_MCP_PERMITIDOS` no `server/.env` (ex.: `mcp__revenuecat,mcp__meta-ads`).
- [ ] **Conectar só dois conectores primeiro:** os que têm seus números mais importantes (por exemplo RevenueCat e Meta Ads; ou Stripe via Claude no Chrome). Os demais depois.
- [ ] **Explorador (Scout) primeiro**, 06:00. Rodar uma vez manualmente (`./scripts/agente.sh explorador`). Verificar: arquivo novo em `data/briefings/AAAA-MM-DD-explorador.md`; `data/mission-data.json` com `meta.fonte = "REAL"` e cada bloco com `fonte` e `data`; valores não verificáveis como `"INDISPONÍVEL"`, nunca `0`. Deixar rodar 3 dias e ler os briefings.
- [ ] **Se a rotina gravar no GitHub** (opção A), sua máquina precisa puxar antes de você acordar: `scripts/agendar.sh` já agenda `sincronizar` às 06:30 (pull, commit e push). Sem isso o painel mostra dados velhos.
- [ ] **Operador**, a cada 3 horas, Gmail e Buffer conectados, `MODO: RASCUNHO`. Durante a primeira semana, ler todos os rascunhos antes de enviar. Só depois trocar para `MODO: AUTÔNOMO-FAQ` no `agents/operador.md`. Dinheiro, reembolso e jurídico nunca ficam autônomos.
- [ ] **Conselheiro**, 06:20, depois que o Explorador tiver 3 ou mais briefings. Verificar `recomendacoes` (exatamente 3) e `pendentes7dias` no `mission-data.json`, e o bloco novo em `data/registro-recomendacoes.md`.
- [ ] **Fechar o ciclo diariamente:** ler as 3 recomendações; dizer ao JARVIS "feito" ou "descartei" (ele marca no registro). O que não for decidido volta por 7 dias.

## Fase 5 · Deixar sempre ligado (30 min)

- [ ] **Servidor no login (scripts prontos).**
  - Windows: `powershell -ExecutionPolicy Bypass -File scripts\servico\instalar-servico.ps1` (tarefa "JARVIS Servidor" ao fazer logon, janela oculta, log em `data/logs/jarvis.log`).
  - macOS: `./scripts/servico/instalar-launchd.sh` (LaunchAgent `com.jarvis.server`, reinicia se cair).
  - Qualquer sistema: `npm i -g pm2 && pm2 start scripts/servico/ecosystem.config.cjs && pm2 save && pm2 startup`.
- [ ] **Painel como aplicativo.** `scripts/servico/abrir-painel.sh` (ou `.ps1`) abre o Chrome/Edge em janela de app, sem barra de endereço. Ou: Chrome → menu → Salvar e compartilhar → Instalar página como app.
- [ ] **Abrir o painel no login** (adicionar o atalho do app às Iniciar/Itens de login) e impedir que a tela desligue, se quiser o HUD sempre visível.
- [ ] **Microfone sempre permitido** para `http://localhost:8080` nas configurações do site, para o modo mãos livres não perguntar de novo.
- [ ] **Sessão nova a cada carga.** Saiba que recarregar o painel ou reiniciar o servidor recomeça a conversa. A memória em `data/memoria.md` e os lembretes em `data/lembretes.json` persistem.

## Fase 6 · Segurança, custo e backup (20 min)

- [ ] `server/.env` **nunca** vai para o Git (já está no `.gitignore`); confirme com `git status`.
- [ ] O servidor escuta só em `127.0.0.1`. Não abra a porta no roteador nem use túnel público sem colocar autenticação na frente.
- [ ] **Limite de gasto mensal** na conta Anthropic, e conferir Usage no fim da primeira semana. Ordem de custo: modelo (Fable 5.1 > Opus 5) > esforço > web search > tamanho do `mission-data.json`.
- [ ] **Versionar o que o JARVIS escreve.** `./scripts/sincronizar.sh` (ou `.ps1`) faz commit de `data/` e `conhecimento/`, pull e push. Já entra no agendamento da Fase 4 às 06:30 e 21:00.
- [ ] **Revisar `data/memoria.md` mensalmente**: apagar o que ficou errado ou velho.
- [ ] **Revogar e recriar a chave** se ela vazar em qualquer lugar (log, captura de tela, commit).

## Fase 7 · Melhorias ainda não construídas (opcional, cada uma é um pedido separado)

- [ ] Voz britânica via ElevenLabs: nova rota no servidor que gera o áudio com a chave do ElevenLabs e o painel toca o áudio em vez da síntese do navegador.
- [ ] Reconhecimento de voz melhor (Whisper local ou API) para ambientes barulhentos.
- [ ] Notificação no celular quando um lembrete vence ou o Explorador reporta alerta (Telegram, Pushover ou e-mail).
- [ ] Sessão persistente entre recargas (salvar o histórico em disco).
- [ ] Subagentes adicionais do Operador (`agents/subagentes/`): designer, financeiro.
- [ ] Ligar o painel a fontes ao vivo sem depender do arquivo (por exemplo o servidor consultar Stripe/RevenueCat direto por API).
- [ ] Autenticação no servidor, se um dia quiser acessar de outro dispositivo da casa.

---

**Critério de "100% operacional":** Fases 0 a 6 concluídas, o Explorador gravando dados reais há pelo menos 3 dias com `meta.fonte = "REAL"`, o painel mostrando `REAL` no selo FONTE DE DADOS e `CLAUDE` no selo CÉREBRO, o resumo matinal falado com dados de verdade, e você lendo as recomendações todo dia.
