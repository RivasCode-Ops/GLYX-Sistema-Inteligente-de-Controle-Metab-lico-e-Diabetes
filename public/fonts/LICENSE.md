# Fontes embarcadas

Os dois arquivos desta pasta são servidos do próprio domínio. Não há requisição
a serviço de fonte em runtime, e o build não depende de o Google estar no ar.

| arquivo | família | licença | origem |
|---|---|---|---|
| `Outfit-Variable.woff2` | Outfit | SIL Open Font License 1.1 | Google Fonts (`fonts.gstatic.com/s/outfit/v15`) |
| `Inter-Variable.woff2` | Inter | SIL Open Font License 1.1 | Google Fonts (`fonts.gstatic.com/s/inter/v20`) |

Ambas são **fontes variáveis**: um arquivo cobre a faixa inteira de pesos. Por
isso são dois arquivos e não quatro — e por isso não há risco de negrito
sintético: o eixo tem 400, 500, 600 e 700 de verdade, que são exatamente os
pesos que o app declara.

Subconjunto **latin** apenas. Se algum dia o app precisar de latin-ext ou de
outro alfabeto, os arquivos precisam ser rebaixados — o subconjunto atual não
cobre.

A SIL OFL 1.1 permite embarcar e redistribuir com o produto. Ela exige que as
fontes não sejam vendidas isoladamente e que o nome reservado não seja usado em
versão modificada — nenhuma das duas coisas acontece aqui, já que os arquivos
são servidos sem alteração.

Texto completo da licença: <https://openfontlicense.org>

---

**Riva's Alexandre**  © 2026
Todos os direitos reservados. A licença acima cobre apenas os arquivos de fonte.
