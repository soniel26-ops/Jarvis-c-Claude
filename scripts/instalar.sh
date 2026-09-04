#!/usr/bin/env bash
# JARVIS · instalador (macOS / Linux). Fases 0, 1 e 2 do CHECKLIST.md.
# Uso: ./scripts/instalar.sh
set -euo pipefail
cd "$(dirname "$0")/.."
echo "JARVIS · instalação"
echo
# Fase 0 · pré-requisitos
if ! command -v node >/dev/null; then echo "✘ Node.js não encontrado. Instale a versão LTS em https://nodejs.org e rode de novo."; exit 1; fi
MAJ=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJ" -lt 20 ]; then echo "✘ Node.js $(node --version) é antigo; precisa ser 20 ou mais novo."; exit 1; fi
echo "✔ Node.js $(node --version)"
command -v git >/dev/null && echo "✔ Git $(git --version | sed 's/git version //')" || echo "⚠ Git não encontrado (necessário para sincronizar dados e agentes)"
# Fase 1 · instalar
cd server
echo "→ npm install"; npm install --no-fund --no-audit --silent
if [ ! -f .env ]; then
  cp .env.example .env
  echo
  echo "Cole a sua chave da API do Claude (console.anthropic.com → API Keys). Ela não aparece ao digitar."
  read -r -s -p "ANTHROPIC_API_KEY: " CHAVE; echo
  if [ -n "$CHAVE" ]; then
    # substitui a linha da chave sem depender de sed -i (difere entre macOS e Linux)
    node -e "const fs=require('fs');let s=fs.readFileSync('.env','utf8');s=s.replace(/^ANTHROPIC_API_KEY=.*$/m,'ANTHROPIC_API_KEY='+process.argv[1]);fs.writeFileSync('.env',s)" "$CHAVE"
    echo "✔ chave gravada em server/.env"
  else echo "⚠ sem chave: o painel vai funcionar em modo local até você preencher server/.env"; fi
  read -r -p "Como o JARVIS deve te chamar? [senhor]: " NOME; NOME=${NOME:-senhor}
  node -e "const fs=require('fs');let s=fs.readFileSync('.env','utf8');s=s.replace(/^JARVIS_NOME_USUARIO=.*$/m,'JARVIS_NOME_USUARIO='+process.argv[1]);fs.writeFileSync('.env',s)" "$NOME"
else echo "✔ server/.env já existe (mantido)"; fi
echo
# Fase 2 · diagnóstico (faz uma chamada pequena à API se houver chave)
node doctor.mjs || true
echo "Para iniciar:  cd server && npm start   →  http://localhost:${JARVIS_PORT:-8080}/mission-control/"
