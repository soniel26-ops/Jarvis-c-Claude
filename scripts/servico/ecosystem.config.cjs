// JARVIS · pm2 (qualquer sistema). Fase 5.
//   npm i -g pm2
//   pm2 start scripts/servico/ecosystem.config.cjs
//   pm2 save && pm2 startup      (o pm2 imprime um comando para rodar como admin; execute-o)
const path = require("path");
module.exports = {
  apps: [{
    name: "jarvis",
    script: "server.mjs",
    cwd: path.join(__dirname, "..", "..", "server"),
    interpreter: "node",
    autorestart: true,
    max_restarts: 20,
    restart_delay: 3000,
    out_file: path.join(__dirname, "..", "..", "data", "logs", "jarvis.out.log"),
    error_file: path.join(__dirname, "..", "..", "data", "logs", "jarvis.err.log"),
    time: true,
  }],
};
