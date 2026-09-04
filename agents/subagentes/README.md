# Subagentes do Operador

O Operador não executa tarefas especializadas; ele delega. Os subagentes são **subagentes reais do Claude Code**, definidos em `.claude/agents/*.md`. Quando o Operador roda pelo Claude Code (`scripts/agente.sh operador`), ele os aciona pela ferramenta `Agent`, cada um com as próprias ferramentas e o próprio modelo.

| Subagente | Quando o Operador aciona | Modelo | Escreve em |
|---|---|---|---|
| `desenvolvedor` | bug, ajuste no painel ou nos scripts, integração | sonnet | branch `fix/*` |
| `designer` | arte e texto de post ou criativo antes do Buffer | haiku | `data/conteudo/` |
| `financeiro` | pagamento falhado, reembolso, cobrança duplicada, nota | sonnet | `data/financeiro/` (sempre rascunho) |
| `pesquisador` | concorrentes, tendências, verificação de fato | haiku | `data/pesquisa/` |

Cada arquivo em `.claude/agents/` tem um cabeçalho com `name`, `description` (é por ela que o Claude Code decide quando usar), `tools` e `model` (`haiku`, `sonnet`, `opus` ou `inherit`), seguido do prompt escrito como descrição de cargo. Para criar outro, copie um deles e ajuste; para baratear, troque `model` para `haiku`.

O que garante a segurança é o mesmo do Operador: nenhum subagente envia, publica, cobra ou reembolsa. Eles produzem rascunhos e relatórios; a ação final é do usuário.
