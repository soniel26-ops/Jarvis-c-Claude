#!/usr/bin/env bash
# JARVIS · gera um certificado autoassinado para servir o painel em HTTPS na rede local.
# O microfone do navegador só funciona fora do localhost em https. Uso: ./scripts/gerar-certificado.sh [ip-ou-nome-desta-máquina]
set -euo pipefail
cd "$(dirname "$0")/.."
command -v openssl >/dev/null || { echo "✘ openssl não encontrado (macOS/Linux já têm; no Windows use o Git Bash ou instale o OpenSSL)"; exit 1; }
HOSTS=${1:-$(hostname)}
mkdir -p server/certs
openssl req -x509 -newkey rsa:2048 -nodes -days 825 -keyout server/certs/jarvis.key -out server/certs/jarvis.crt \
  -subj "/CN=jarvis" -addext "subjectAltName=DNS:localhost,DNS:$HOSTS,IP:127.0.0.1$( [[ "$HOSTS" =~ ^[0-9.]+$ ]] && echo ",IP:$HOSTS" )" 2>/dev/null
echo "✔ certificado em server/certs/ (válido por 825 dias)"
echo "No server/.env:"
echo "  JARVIS_TLS_CERT=$(pwd)/server/certs/jarvis.crt"
echo "  JARVIS_TLS_KEY=$(pwd)/server/certs/jarvis.key"
echo "No celular/tablet, o navegador vai avisar que o certificado é autoassinado: aceite uma vez (ou instale server/certs/jarvis.crt como confiável)."
