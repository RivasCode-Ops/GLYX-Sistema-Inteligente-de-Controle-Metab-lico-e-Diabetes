# Decisões D1–D4 — aprovadas em 15/10/2026

**D1–D4 APROVADAS pelo Rivas em 15/10/2026**, como regras de produto para implementação **local**. Isso
não aprova os demais documentos nem autoriza implantação (A2 continua não autorizada). Implementadas e
testadas no mesmo dia — resultado em [`PLANO-IMPLEMENTACAO.md`](PLANO-IMPLEMENTACAO.md) §3.3 e §5.

## Regras aprovadas e como ficaram no código

| | Regra aprovada | Como ficou |
|---|---|---|
| **D1** | Frequência obrigatória e escolhida explicitamente em cadastro novo. Preservar o comportamento dos 12 registros antigos. Mostrar "frequência a confirmar" nos legados. Confirmar exige ação explícita. Não alterar horário nem frequência dos antigos. | Cadastro com horário e sem frequência é recusado com frase (manual e por foto). Coluna nova `medications.cadence_confirmed_at`, **sem preenchimento automático**: todo item existente fica "a confirmar". O alarme dos antigos **não muda** (frequência nula ou pela metade continua tocando todo dia). Botão "Está certo: …" registra a confirmação sem mudar horário nem frequência; na edição, a frequência de item a confirmar vem **vazia** e, deixada assim, não muda nada nem confirma. |
| **D2** | Intervalo contado da data de início escolhida; não dispara antes dela; aviso quando o início está no futuro. | Regra que já estava no código e no banco, mantida. Aviso no cartão: "Primeira dose em dd/mm/aaaa — nenhum alarme antes dessa data." |
| **D3** | Não ativar alarme implícito em item "livre" com horário; tratar como inconsistente; exigir escolha explícita de frequência e programação para ativar; não inventar orientação de uso; não criar funcionalidade ampla de "uso livre". | "Livre" continua sem alarme (banco e app). O cartão mostra "Configuração inconsistente…". Na edição aparece "Programação do alarme" (manter sem alarme / flexível / rígido), com a frequência **vazia**: ativar exige escolher as duas no mesmo envio; só programação é recusada com frase. Nenhuma tela nova para escolher "livre". |
| **D4** | Na exclusão, apagar também o histórico individual de uso de IA; sem retenção de 1 h nem cron; manter o teto global; testar e documentar que a exclusão pode reiniciar a cota; sem identificador oculto; se o teto depender dos registros apagados, informar o conflito. | A exclusão apaga **todo** o `ai_usage` da pessoa, pelo servidor (chave de serviço) e **só** dentro de "apagar todos os meus dados". A função `apagar_meu_uso_de_ia` deixou de existir: com ela, qualquer pessoa zeraria a própria cota a qualquer momento sem apagar mais nada. Testado: com a cota cheia (30/h) o chat é recusado; depois da exclusão, aceito — **a cota reinicia**, como aprovado. Nada de retenção, cron ou identificador. |

### Conflito da D4 com o "teto global" — informado, não resolvido

**Não existe teto global de gasto que bloqueie chamadas de IA no código.** `AI_DAILY_BUDGET_USD` e
`AI_MONTHLY_BUDGET_USD` alimentam só o **medidor** do painel admin (`components/admin/spend-gauge.tsx`),
que soma `ai_usage` pela função `admin_ai_spend`. Ou seja: (1) o que limita custo hoje é a cota por
pessoa por hora; (2) o medidor depende justamente dos registros que a exclusão apaga — depois de uma
exclusão, ele deixa de contar aquelas chamadas (demonstrado no teste SQL). A afirmação anterior deste
documento, de que "o teto global de gasto continua limitando o custo", **estava errada** e fica corrigida
aqui. Limite de gasto no provedor de IA (conta Kimi/OpenAI), se houver, é **desconhecido** daqui.
Esta proteção **não** é declarada preservada. Criar um teto real seria funcionalidade nova, fora deste lote.

---

## Análise que levou às decisões (histórico — 14 e 15/10)

**Situação até 15/10:** nenhuma aprovada; o código seguia uma opção de cada só para teste.

**Revisado tecnicamente em:** 15/10/2026 (segunda revisão) · **Situação: NENHUMA aprovada.** O código do
lote 1 segue uma opção de cada decisão **só para poder ser testado**. Nada aqui é requisito definitivo, e
comportamento antigo **não** é tratado como intenção clínica confirmada.

**Registros afetados hoje (A3, 15/10, contagem agregada):** 12 remédios ativos com horário, de 1 conta,
**todos** com `diaria` gravada pela migration de 07/09 (criados antes de 08/09) — é o caso "não confirmado"
de D1. Frequência vazia: 0. Intervalo (D2): 0. Rigidez `livre` (D3): 0. Uso de IA na última hora e nas
últimas 24 h (D4): 0. **Nenhuma das quatro decisões muda um alarme na implantação**; elas definem a
regra para os próximos cadastros e o que fazer com os 12 itens presumidos.

## Tabela para decidir

| | Regra exata no código do lote 1 | Efeito nos registros antigos | Alternativa recomendada |
|---|---|---|---|
| **D1** | Frequência vazia **ou incompleta** = toca todo dia. Formulário com o campo vazio e item com horário grava `diaria`. | Nenhum alarme muda na implantação. Mas `diaria` já existe por presunção: a migration de 07/09 gravou `diaria` em todo item com horário, e o formulário do lote 1 grava `diaria` quando o campo fica vazio. | Continuar tocando; parar de gravar `diaria` por conta própria; frequência obrigatória em cadastro novo; itens antigos marcados como "não confirmada". |
| **D2** | "A cada N dias" toca na data de início e a cada N dias depois; antes dela, não toca. Data de início obrigatória. | Nenhum: nenhuma tela gravava intervalo antes do lote 1. | Manter a regra e avisar quando a data de início estiver no futuro. |
| **D3** | Rigidez `livre` não recebe alarme de dose nem reenvio de adiamento, **mesmo com horário cadastrado**. | Afeta só linha `livre` com horário; nenhuma tela grava `livre`. Quantas existem: A3. | `livre` **com horário** continua recebendo alarme até existir tela que explique "sem alarme"; `livre` sem horário não tem o que tocar. |
| **D4** | Exclusão mantém 24 h de uso de IA, sem limpeza automática; a tela diz "todos os registros". | Nenhuma coluna nova; afeta só exclusões futuras. | Reter cada chamada até completar 1 h **da própria chamada**, limpeza a cada 5 min, mensagem que diz o que acontece inclusive se a limpeza falhar (proposta revisada abaixo). |

---

## D1 e D3 — três coisas que não se misturam

| | D1 (frequência) | D3 (rigidez "livre") |
|---|---|---|
| **Compatibilidade com dados antigos** — o que fazer na implantação para não mudar nada sem aviso | Itens antigos continuam tocando todo dia, como sempre tocaram. Isso é **preservar comportamento**, não confirmar que o remédio é diário. | Itens antigos com horário continuam com alarme, como sempre tiveram. Isso é **preservar comportamento**, não confirmar que a pessoa quer alarme. |
| **Informação não confirmada** — o que o banco tem, mas ninguém disse | `cadence` nula ("não declarada", pelo comentário da coluna) **e** `diaria` gravada por presunção (migration de 07/09; formulário do lote 1 com o campo vazio). Hoje o banco **não distingue** `diaria` escolhida de `diaria` presumida. | `livre` com horário cadastrado: dado **contraditório** — "livre" quer dizer "sem hora certa" (comentário da coluna). O app de adesão já trata isso como inconsistência (`lib/medications/adherence-status.ts`). |
| **Regra para novos cadastros** — o que o app deve exigir daqui para frente | Frequência **obrigatória** quando há horário; o app não preenche sozinho. Exige marcar quando a frequência foi confirmada (coluna nova, nula nos antigos) e mostrar "frequência não confirmada" até a pessoa escolher. | "Livre" só pode ser escolhido numa tela que diga "sem alarme"; escolher "livre" limpa os horários ou pede confirmação. Nenhuma tela faz isso hoje. |

### Por que a recomendação de D3 mudou

Em 14/10 a recomendação era "livre = sem alarme", lendo o **comentário da coluna** como intenção. Na
revisão de 15/10 apareceram três fatos que mudam a leitura:

1. **Nenhuma tela grava `livre`.** Ninguém escolheu "livre" sabendo o que ele faz; se existir linha
   `livre`, veio de outro caminho.
2. **O alarme antigo tocava para `livre` com horário.** Desligar agora tiraria um alarme que a pessoa
   recebe hoje, sem ela ter pedido.
3. **O próprio app já trata `livre` com horário como dado inconsistente** (adesão marca "fora da janela"
   para o caso aparecer no relatório).

Entre os dois erros possíveis — tocar alarme de algo que talvez não precise e calar o alarme de um
remédio — o segundo é o pior e não se percebe. Daí a troca. Continua **sem aprovação**.

### Testes que mudam conforme a escolha

| Se você escolher… | Testes que precisam mudar |
|---|---|
| **D3 recomendada** (`livre` com horário mantém alarme) | `lib/medications/cadence-casos.json` caso `livre-sem-alarme` (passa a esperar alarme; o id muda); `supabase/tests/med_alarms_due.sql` linha do mesmo caso; `lib/medications/cadence.test.ts` "só a rigidez 'livre' desliga o alarme"; `lib/db/med-alarms-migration.test.ts` "rigidez 'livre' não tem alarme (D3)", que exige o filtro `timing_strictness is distinct from 'livre'` na migration. Código: o filtro sai das duas consultas de `20261014120000` e `alarmeHabilitado` em `lib/medications/cadence.ts` muda. |
| D3 como está no código (sem alarme) | Nenhum teste muda; entra um teste de tela quando houver tela que escolha "livre". |
| **D1 recomendada** (não gravar `diaria` sozinho; obrigatório em cadastro novo) | `lib/medications/cadence.test.ts` "vazio vira diária quando há horário…" (passa a esperar recusa com frase); novos testes da coluna de confirmação e do aviso. **Não mudam**: caso `nula-com-horario` do JSON, sua linha em `med_alarms_due.sql` e "cadência não declarada continua diária" em `day-summary.test.ts` — o alarme continua tocando. |
| D1 alternativa "nula não toca" | Os três testes acima, que hoje esperam alarme para frequência nula, passam a esperar o contrário, além de "cadência pela metade cai na regra de cadência não declarada". **Não recomendado.** |

---

## D4 — proposta revisada (não implementada)

**A expiração é contada da data de cada chamada, nunca do pedido de exclusão.** O pedido não reinicia
nem estende prazo: uma chamada feita 50 min antes do pedido expira 10 min depois dele; uma chamada com
mais de 1 h é apagada na hora do pedido.

| | |
|---|---|
| **Janela que o limite precisa** | 1 hora deslizante (`lib/ai/rate-limit.ts`, `JANELA_SEGUNDOS = 3600`). Nada além disso é necessário para o limite. |
| **O que fica e com que vínculo** | Só linhas de `ai_usage` com menos de 1 h: `user_id`, `kind`, `created_at`, `prompt_tokens`, `completion_tokens`, `model`. Nenhum conteúdo. Vinculadas ao usuário por `user_id` enquanto existirem. |
| **Mecanismo** | Na exclusão: apagar o que tem 1 h ou mais; nas linhas restantes, gravar `apagar_apos = created_at + 1 hora` (coluna nova, nula para quem não pediu exclusão). Um job do `pg_cron` **a cada 5 minutos** apaga as linhas com `apagar_apos <= now()`. |
| **Prazo efetivo** | Com a limpeza funcionando: cada linha some entre **1 h e 1 h 05 min depois da chamada** (o atraso é o intervalo do job). Contado do pedido: no máximo ~1 h 05 min. |
| **Se a limpeza falhar** | Não há prazo máximo garantido: a linha fica até a próxima execução bem-sucedida do job, ou até a pessoa pedir exclusão de novo (a função apaga as vencidas). O limite de uso não é afetado (a janela já ignora linhas com mais de 1 h). Detecção: `select count(*) from ai_usage where apagar_apos < now() - interval '15 minutes'` deve dar **0**; hoje nenhum alerta automático olha isso — incluí-lo no monitor de crons faz parte da implementação. |
| **Mensagem na tela** | "Seus registros foram apagados. Para evitar uso abusivo da IA, guardamos o registro técnico das chamadas feitas na última hora (data, tipo e tamanho, sem o conteúdo). Cada um é apagado pela limpeza automática, que roda a cada 5 minutos, depois de completar 1 hora. Se a limpeza falhar, ele é apagado na próxima execução. A conta de login continua ativa." — **não promete "até 1 hora"**, porque a implementação permite ~1 h 05 e mais em caso de falha. |
| **Teste de expiração** (SQL, transação desfeita) | Linhas com 2 h, 50 min e 5 min de idade → exclusão → a de 2 h some; as outras ficam com `apagar_apos` = **data da chamada** + 1 h (não a do pedido). Limpeza rodada com "agora" fixo: aos +10 min some a de 50 min; aos +55 min some a de 5 min. Controle negativo: com `apagar_apos` calculado a partir do pedido, o teste falha. |
| **Teste de limite** (SQL) | Conta no limite (5 de 5) pede exclusão → a próxima chamada **continua recusada**; com as chamadas movidas para 61 min atrás → aceita. |
| **Teste de falha** (SQL) | Sem rodar a limpeza, linha vencida continua lá, **não** conta no limite e aparece na consulta de detecção; nova exclusão a apaga. |
| **Teste de tela** | Depois da exclusão aparece a mensagem nova; "todos os seus registros" não aparece; "até 1 hora" não aparece. |
| **Efeito colateral** | O relógio de gasto **diário** do painel admin deixa de contar o uso de quem apagou os dados. |

**Por que coluna e não limpeza geral:** apagar `ai_usage` antigo de todo mundo resolveria a retenção,
mas também apagaria o histórico de custo do painel admin de quem **não** pediu exclusão.

Outras opções: apagar tudo como antes (a exclusão volta a zerar o limite — **opção aprovada em 15/10**; a
frase original dizia que "o teto global de gasto continua limitando o custo", o que **não é verdade**: ver o
conflito informado no topo); ou contador fora do banco com expiração de 1 h (serviço novo). A base legal para
qualquer retenção depois do pedido precisa constar da política — liga com D6.

---

**Riva's Alexandre**  © 2026
Todos os direitos reservados. Decisões D1–D4 do lote 1, aprovadas e implementadas localmente.
