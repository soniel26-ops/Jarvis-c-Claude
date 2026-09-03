# Subagentes do Operador

O Operador não executa tarefas especializadas; ele delega. Cada subagente tem um arquivo aqui com:

1. **Quando é acionado** (que tipo de pedido o Operador encaminha para ele).
2. **Ferramentas e conectores** que ele pode usar.
3. **O que ele nunca faz.**
4. **O prompt**, escrito como uma descrição de cargo, no mesmo tom do `agents/operador.md`.

Comece com um só (`desenvolvedor.md`). Adicione outros conforme aparecerem pedidos repetidos que o FAQ não resolve, por exemplo `designer.md` (artes para posts) ou `financeiro.md` (conciliação de pagamentos, sempre em modo rascunho).
