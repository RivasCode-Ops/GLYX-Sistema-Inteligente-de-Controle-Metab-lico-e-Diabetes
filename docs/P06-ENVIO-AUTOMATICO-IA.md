# P06 — envio automático de glicemia à IA

**Revisado em:** 15/10/2026 · **Situação:** aberto, aguardando D5 e D6. **Nada foi alterado** no
consentimento nem no envio de dados; este documento só descreve o estado e as opções.

## Estado atual (código do repositório)

| | |
|---|---|
| **Quem dispara** | Cron `glyx-meal-suggest` no banco, **a cada 15 min** (`20260713220000`; função reescrita em `20260718010000`, endereço via Vault desde `20260726020000`). |
| **Quem entra** | Toda conta **não desativada** com notificação ativa no aparelho, nos últimos 15 min das janelas de refeição (07:00–09:00, 11:30–14:00, 18:00–20:30, no fuso da pessoa), se ela não registrou refeição naquela janela. No máximo uma sugestão por refeição por dia. |
| **O que vai ao provedor de IA** | Tipo da refeição, objetivo corporal, **tipo de diabetes**, **última glicemia** (sem data — pode ser de dias atrás), calorias e carboidratos do dia. **Não vão** nome, e-mail nem identificador da conta. |
| **Ação do titular** | **Nenhuma.** Não há opção para ligar ou desligar. A única forma de não receber é não ter notificação ativa, o que também desliga os alarmes de remédio. |
| **Provedor** | O que estiver configurado em produção (o código aceita três). Nome, país e base legal não constam na política (D6). |
| **O que já foi conferido** | Em teste local de 14/10, com IA simulada: o prompt levou a glicemia (P06 confirmado). Em produção, **não se sabe se o cron está ativo** nem quantas sugestões saem — consulta B6 da A3. |
| **Divergência registrada** | `docs/DPIA.md` §11, linha 1: o DPIA diz que a IA só é usada quando o titular aciona. |

## Decisões pendentes

- **D5 — o que fazer com o envio automático:** (a) tirar do prompt o tipo de diabetes e a glicemia;
  (b) pedir consentimento específico (opt-in, desligado por padrão); (c) manter e declarar na política e
  no DPIA.
- **D6 — o que a política diz:** nome do provedor, país de processamento e base legal. Exige
  confirmação com o provedor e, de preferência, assessoria.

## Dá para manter desligado até decidir?

**Sim.** Desligar também muda o que a pessoa recebe, então não deve ser silencioso: avise quem usa
(você e a Thuany) que as sugestões de refeição param até a decisão.

| Opção | Como | Efeito | Exige |
|---|---|---|---|
| **1. Desativar o job** (recomendada) | `cron.alter_job(…, active := false)` no job `glyx-meal-suggest` — agenda e comando ficam guardados; volta com `active := true`. Ação exata em [`PROXIMAS-AUTORIZACOES.md`](PROXIMAS-AUTORIZACOES.md) §B | Para tudo na hora: nada sai para a IA, nenhuma sugestão chega | escrita em produção: **autorização própria** (D13; não é A3, que só lê) — **não autorizada em 15/10** |
| 2. Interruptor no código | A rota de sugestão só chama a IA se uma variável de ambiente nova estiver ligada | O cron continua rodando e registrando, mas sem chamada à IA | mudança de código + deploy |
| 3. Tirar só o dado clínico | Remover tipo de diabetes e glicemia do prompt | Não é "desligar": já é escolher a opção (a) de D5 | decisão D5 |

Antes de qualquer opção, a consulta B6 da A3 mostra se o cron está ativo e quantas sugestões saíram nos
últimos 14 dias.

---

**Riva's Alexandre**  © 2026
Todos os direitos reservados. Estado do envio automático de dados à IA.
