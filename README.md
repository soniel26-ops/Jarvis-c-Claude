# JARVIS com Claude

Assistente pessoal de IA que monitora receita, gerencia e-mails, publica conteúdo e diz em que se concentrar todas as manhãs. Uma tela de controle com voz e três agentes: **Explorador** coleta, **Operador** executa, **Conselheiro** prioriza.

```
mission-control/index.html      tela de controle (HTML único, CSS+JS embutidos, sem dependências)
agents/explorador.md            prompt + regras da rotina do Explorador (somente leitura)
agents/operador.md              prompt + regras do Operador (e-mail, publicação, delegação)
agents/conselheiro.md           prompt + regras do Conselheiro (3 recomendações/dia)
agents/subagentes/              descrições de cargo dos subagentes que o Operador aciona
conhecimento/faq.md             o limite do Operador: se não está aqui, escala
data/mission-data.json          o objeto de dados que o painel lê e os agentes gravam
data/registro-recomendacoes.md  histórico de 7 dias que o Conselheiro relê
data/briefings/                 um arquivo por execução de agente
```

## 1. Abrir a tela de controle

Sem servidor: abra `mission-control/index.html` no Chrome ou Edge. Funciona com o objeto de dados simulado embutido no arquivo.

Com dados do Explorador: sirva a pasta do repositório por HTTP para que o painel consiga carregar `data/mission-data.json`.

```bash
python3 -m http.server 8080
# depois abra http://localhost:8080/mission-control/
```

O selo **FONTE DE DADOS** no rodapé mostra `SIMULADO` ou `REAL` conforme o campo `meta.fonte` do JSON.

Interação:

| Ação | Como |
|---|---|
| Falar | clique na esfera, ou segure **ESPAÇO** (fora do campo de texto) |
| Digitar | campo na parte inferior + Enter |
| Resumo matinal | botão **☼ RESUMO MATINAL** no canto do centro |
| Interromper a fala | **Esc** |

Comandos entendidos localmente: receita, anúncios, e-mails, tráfego, objetivo, alertas, pendentes, hora, status, resumo matinal.

Voz: usa o reconhecimento e a síntese do próprio navegador (Chrome e Edge têm suporte completo; Firefox não tem reconhecimento). Ajuste `CONFIG.idiomaVoz` e `CONFIG.vozPreferida` no topo do script. Para a voz britânica estilo Jarvis via ElevenLabs, troque a função `say()` por uma chamada ao seu backend; não coloque a chave do ElevenLabs no HTML, ele roda no navegador.

## 2. Ligar cada número a uma fonte real

Todo número do painel vive em um único objeto, `DADOS`, no início do script de `index.html`, comentado campo a campo. `data/mission-data.json` tem exatamente o mesmo formato. Quando servido por HTTP, o painel lê o JSON e sobrescreve o objeto embutido campo a campo, então você troca dado simulado por real sem tocar no design.

Regras do formato (valem para humanos e agentes):

- números são números, sem `R$` nem separadores;
- valor não verificável é a string `"INDISPONÍVEL"`, nunca `0` nem uma estimativa. O painel exibe em âmbar e não calcula com ele;
- cada bloco carrega `fonte` e `data` de obtenção;
- `recomendacoes` e `pendentes7dias` pertencem ao Conselheiro; tudo o resto, ao Explorador (e `email`/`publicacoes` ao Operador).

## 3. Ordem de montagem

1. **Tela de controle** primeiro, mesmo com dados falsos. Um sistema que você vê é um sistema que você continua usando.
2. **Explorador.** Somente leitura, não quebra nada. Crie uma rotina diária no Claude (06:00) com o conteúdo de `agents/explorador.md` e conecte só os dois conectores com seus números mais importantes (por exemplo RevenueCat e Meta Ads). Adicione os outros conforme necessário.
3. **Operador.** Preencha `conhecimento/faq.md` com as perguntas que seus clientes repetem, na sua voz. Rotina a cada 3h com `agents/operador.md`, Gmail e Buffer conectados. **Primeira semana em MODO RASCUNHO:** leia cada rascunho antes de permitir envio autônomo.
4. **Conselheiro.** Rotina diária logo após o Explorador (06:20) com `agents/conselheiro.md`. Só faz sentido quando o Explorador já tem alguns dias de histórico.
5. **Dados reais no painel.** Sirva por HTTP e deixe o Explorador gravar `data/mission-data.json`.

Um agente de cada vez. Cada um conquista o próximo.

## 4. Como as rotinas gravam neste repositório

Cada agente roda como uma rotina do Claude com este repositório como fonte. Ao final da execução ele grava seus arquivos (`data/briefings/…`, `data/mission-data.json`, `data/registro-recomendacoes.md`) e faz commit na branch principal. O painel servido a partir do checkout atualizado mostra os novos números na próxima carga.

Se preferir não dar acesso de escrita ao repositório, aponte os agentes para um diretório sincronizado (Drive, iCloud) e sirva o painel de lá; o formato do JSON é o mesmo.

## 5. As regras que garantem a segurança

- Nada é enviado, gasto ou publicado sem a sua intervenção até que seja merecido. Rascunho primeiro, sempre. Promova um agente ao modo autônomo só no tipo de tarefa que você o viu acertar repetidas vezes.
- Cada número traz origem e data. O que não for verificável é marcado `INDISPONÍVEL`, não estimado.
- O FAQ é o limite. Se a resposta não está nele, o Operador escala, e você adiciona a linha para que aquele caso nunca mais seja escalado.
- Nunca dinheiro, reembolso ou jurídico sem aprovação sua. Não existe modo autônomo para isso.
- Leia as recomendações do Conselheiro mesmo nos dias em que não fizer nada com elas. Marque `FEITO` ou `DESCARTADO` no registro; o que fica pendente reaparece por 7 dias.

## 6. Limitações conhecidas

- O "cérebro" embutido no painel responde por regras simples sobre o objeto de dados. Ele não chama nenhum modelo. Para respostas em linguagem natural, substitua a função `responder()` por uma chamada ao seu backend que fale com a API do Claude.
- A saudação falada na inicialização pode ser bloqueada pelo navegador até o primeiro clique (política de autoplay). O texto aparece de qualquer forma.
- Os dados incluídos são simulados e servem para demonstrar o painel. O selo no rodapé deixa isso explícito.
