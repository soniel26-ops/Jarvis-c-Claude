// =====================================================================
// JARVIS · capacidades e preços por modelo
// O servidor monta cada requisição conforme o que o modelo aceita, para que
// trocar JARVIS_MODEL no .env nunca gere uma requisição inválida.
// Preços: US$ por milhão de tokens (entrada, saída), tabela da Anthropic.
// =====================================================================
export const PRECO = {
  "claude-fable-5-1": [10, 50], "claude-fable-5": [10, 50],
  "claude-opus-5": [5, 25], "claude-opus-4-8": [5, 25], "claude-opus-4-7": [5, 25], "claude-opus-4-6": [5, 25],
  "claude-sonnet-5": [2, 10], "claude-sonnet-4-6": [3, 15],
  "claude-haiku-4-5": [1, 5],
};
export const MODELO_PADRAO = "claude-sonnet-5";   // melhor relação custo/qualidade para conversa por voz

export function capacidades(model = "") {
  const fable = /^claude-(fable|mythos)-5/.test(model);
  const opus5 = /^claude-opus-5/.test(model);
  const opus4x = /^claude-opus-4-(6|7|8)/.test(model);
  const sonnet5 = /^claude-sonnet-5/.test(model);
  const sonnet46 = /^claude-sonnet-4-6/.test(model);
  const haiku = /^claude-haiku/.test(model);
  return {
    fable,
    effort: !haiku && !/^claude-sonnet-4-5/.test(model),     // output_config.effort (Haiku 4.5 e Sonnet 4.5 rejeitam)
    adaptive: fable || opus5 || sonnet5 || opus4x || sonnet46, // thinking adaptativo; Haiku exigiria budget_tokens (não usamos thinking nele)
    fallbacks: fable || opus5,                                  // fallbacks de recusa do lado do servidor (beta)
    binding: fable,                                             // controle de blocos de raciocínio (beta)
    sistemaMeioDaConversa: fable || opus5 || /^claude-opus-4-8/.test(model), // mensagens role:"system" no meio do histórico
    webSearchNovo: opus5 || opus4x || sonnet5 || sonnet46 || fable,          // web_search_20260209 (Fable: tentado; desliga se rejeitar)
    contexto: haiku ? 200000 : 1000000,
    preco: PRECO[model] || [0, 0],
  };
}
export function ferramentaWeb(model) {
  return { type: capacidades(model).webSearchNovo ? "web_search_20260209" : "web_search_20250305", name: "web_search", max_uses: 3 };
}
export function custoEstimado(model, uso = {}) {
  const [pi, po] = PRECO[model] || [0, 0];
  const entrada = (uso.input_tokens || 0) + (uso.cache_creation_input_tokens || 0) * 1.25 + (uso.cache_read_input_tokens || 0) * 0.1;
  return (entrada * pi + (uso.output_tokens || 0) * po) / 1e6;
}
