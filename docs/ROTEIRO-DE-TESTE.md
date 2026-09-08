# GLYX — roteiro de teste

**Versão no ar:** 08/09/2026, revisto após a auditoria de tela do mesmo dia
**Original:** merge de 08/09/2026 · 51 telas · 40 rotas de API · 51 ações de servidor
**Endereço:** https://glyx-sistema-inteligente-de-control.vercel.app

---

## Antes de começar: não, não está tudo 100%

Você perguntou se tudo é 100%. **Não é**, e a lista do que falta está no fim
deste documento — §7 e §8. Elas não são desculpa: são o que você não deve perder
tempo testando, porque já sei que não está lá.

Há também uma armadilha maior que qualquer bug, e ela aparece várias vezes aqui:
**tela vazia nem sempre é defeito.** Boa parte do GLYX se recusa a mostrar
número sem base — e essa recusa é a funcionalidade, não a falha dela. Cada vez
que isso acontecer, este roteiro diz de antemão, para você não caçar defeito
onde está o comportamento projetado.

Os números abaixo saíram do seu banco em 08/09/2026, não de estimativa:

| o que | quanto você tem | efeito no teste |
|---|---|---|
| Glicemias | 5.026 (200 nas últimas 24 h) | tudo de glicemia tem base farta |
| Refeições | 60 (56 nas últimas 8 semanas) | alimentação tem base |
| Doses registradas | 292 · 12 remédios com horário | adesão tem base |
| Sessões de treino | 21, mas **só 1 nas últimas 4 semanas** | Exercícios aparece quase vazio |
| Registros de carga | **5**, de 22/07 a 14/08, em 2 exercícios | Evolução aparece quase vazia |
| Medidas corporais | 4 | Composição tem pouco histórico |
| Noites de sono | **0** | checklist de platô dirá "sem dado" |
| Exames | **0** | Exames só testa cadastro |
| Sensor CGM | 1 conexão ativa | sincronismo testável |
| Google Fit | **0** | integração não conectada |

---

## 1. O que mais importa testar: o motor de segurança

Esta é a razão de tudo isto existir. Em 07/09 o app **liberou berberina para
você, que usa insulina**. A causa não era o modelo ser ruim — era ele decidir. O
veredito passou a ser de regra determinística sobre base curada, e o modelo só
redige o que já foi decidido.

### 1.1 Checagem de suplemento

**Onde:** Medicação → **Meus medicamentos** (`/medicacao/medicamentos`) — a checagem fica nessa aba, não na tela de doses

> **Correção de 08/09:** a primeira versão deste roteiro mandava digitar quatro
> substâncias, e **não havia campo de texto** — só foto. Os quatro testes-âncora
> eram inexecutáveis. Eu tinha descrito a interface a partir do motor, sem abrir
> a tela. O campo existe agora, e é o caminho mais direto: digitado, nenhum
> modelo entra antes do motor decidir.

| teste | o que deve acontecer |
|---|---|
| Digite **berberina** | Alerta **grave**: "RISCO DE HIPOGLICEMIA GRAVE. Berberina potencializa o efeito da insulina." Deve citar a Lantus e o Fiasp |
| Digite **vitamina D** | "Conheço e não achei interação" — em **cinza**, dizendo que a base é limitada. **Nunca em verde, nunca a palavra "seguro"** |
| Digite **maca peruana** (ou qualquer coisa fora da base) | "O app não conhece esta substância" — e a frase de que ausência de alerta não é ausência de risco |
| Digite **Addera D3** | ⚠️ **Vai dizer "não conheço"** — e está errado. É vitamina D3, que está na base. Falta o apelido da marca; a correção está escrita e não aplicada (§7) |

**O que nunca pode aparecer:** a palavra "seguro", um card verde, ou qualquer
sugestão de dose.

### 1.2 O que ele já sabe sobre a sua combinação atual

Conferi no banco: com o que está **ativo** hoje, o motor encontra 5 interações.

| gravidade | par | seus itens |
|---|---|---|
| **grave** | berberina × insulina basal | Berberina + Insulina Lantus |
| **grave** | berberina × insulina rápida | Berberina + Fiasp FlexTouch |
| moderada | berberina × estatina | Berberina + Rosuvastatina |
| moderada | berberina × DPP-4 | Berberina + Glyxambi |
| moderada | berberina × SGLT2 | Berberina + Glyxambi |

Isso é para levar ao seu médico. O app relata a associação; **a conduta é dele**.

### 1.3 Leitura de rótulo por foto

**Onde:** Medicação → **Meus medicamentos** → adicionar por foto

Fotografe o rótulo de um suplemento. O app lê a foto, **decide pela regra**, e só
depois redige. Com achado grave, o modelo nem é chamado.

---

## 2. Medicação

**Onde:** Medicação (`/medicacao`)

| teste | esperado |
|---|---|
| Tiles do topo | doses de hoje, nº de medicamentos, atrasadas, adesão |
| Adesão antes da primeira dose vencer | **travessão "—", não "0%"** — zero seria acusação sobre o que ainda não aconteceu |
| "Registrar agora" na próxima dose | grava e o card atualiza |
| Registrar dose **atrasada** | **tem que aceitar.** O app nunca recusa registro: registro atrasado é informação certa, registro ausente é informação errada |
| Marcar dose já tomada, de novo | não duplica |
| **Adiar** uma dose | ⚠️ teste com atenção: eu quebrei isto hoje e consertei. Deve aceitar e mostrar o novo horário |
| Adiar a mesma dose 3 vezes | na terceira, o botão de adiar **some** e aparecem "Registrei" / "Pulei hoje" |
| Meus medicamentos | cadastrar, editar, estoque, alarmes |
| Botão de registrar em item **com horário** | deve aparecer — ele sumia antes de 07/09 |

## 3. Glicemia

**Onde:** Glicemia (`/glicemia`)

| teste | esperado |
|---|---|
| Cartão principal | valor, faixa colorida, tendência |
| Idade da leitura | se a última leitura for velha, ele diz **há quanto tempo** — não mostra número velho como se fosse de agora |
| Registrar leitura manual | grava e reordena |
| Histórico | média por dia |
| Pressão arterial | registrar sistólica/diastólica/pulso |
| Sensor | você tem 1 conexão e 200 leituras nas últimas 24 h — deve estar sincronizando |

## 4. Alimentação

**Onde:** Alimentação (`/alimentacao`)

| teste | esperado |
|---|---|
| Tiles de macros | kcal, carboidrato, proteína, gordura do dia |
| **Proteína em g/kg** | logo abaixo das gramas, com o alvo do seu objetivo — e a ressalva de que meta individual é de nutricionista |
| Registrar refeição | manual, por texto ou por foto |
| Por foto | a IA estima; você corrige antes de salvar |
| Montar prato | fotografe a despensa e ele monta um prato |
| Água e bebidas | só bebida hidratante conta para a meta; café e refrigerante entram como extra |

## 5. Exercícios

⚠️ **Você tem 1 treino nas últimas 4 semanas e 5 registros de carga (de julho).**
Boa parte desta seção vai aparecer vazia — e vazio aqui é o comportamento certo.

**Onde:** Exercícios (`/exercicios`)

| teste | esperado |
|---|---|
| Treino de hoje | o que o plano cadastrado diz para hoje, com grupos e tempo previsto |
| Sua semana | 7 pontos; dia sem registro no passado é **cinza**, dia que ainda não chegou é **tracejado** |
| Resumo rápido — kcal | **vai mostrar travessão.** O app não estima caloria de treino: sem peso, intensidade e frequência cardíaca, seria chute com cara de medida |
| Carga da semana | "sem semana anterior para comparar" se a anterior teve zero minuto — não inventa "+100%" |
| Plano | a semana inteira, com o dia de hoje destacado em azul |
| Recuperação | barra por grupo muscular. Grupo **pausado** ou **sem registro** aparece **sem barra** — não com barra cheia. Esse era um defeito, corrigido hoje |
| Pausar um grupo ("Não consigo") | pausa vence o cronômetro |
| **Evolução** (aba nova) | ⚠️ vai dizer "sem carga registrada" na maior parte. Com 5 registros em 2 exercícios, não há dois lados da janela para comparar |
| Checklist de platô | só aparece quando há platô de verdade. Se aparecer, **sono dirá "sem dado"** — Google Fit não está conectado |

## 6. Composição, Análise, Exames e Perfil

| tela | teste |
|---|---|
| Composição | medidas, fotos, metas, e o veredito ("ganho de massa magra", "recomposição"…) |
| — a força no veredito | logo abaixo dele, se a carga acompanhou. Com 5 registros, dirá "sem carga registrada no período" |
| Análise → Semana | resumo dos 7 dias |
| Análise → Correlações | o que anda junto com o quê |
| Análise → Linha do tempo | eventos em ordem |
| Análise → Alertas | você tem 19 |
| **Medicação → Interações** (nova) | as 5 interações do seu conjunto ativo, com os nomes de cada lado — e a lista do que a base **não** reconhece |
| Análise → score de risco | agora traz a idade ao lado, e um aviso quando o relatório passou da janela que cobre |
| Relatório para o médico | idem, com o aviso emoldurado **acima** dos números |
| Exames | ⚠️ **você tem 0**. Só dá para testar cadastrando um: cole o texto ou fotografe |
| Perfil → Hipoglicemia | ⚠️ **plano ainda não cadastrado.** Enquanto não estiver, o card dirá "plano não configurado" — o app nunca inventa a conduta. A aba estava órfã até 08/09 (só por URL); agora está no menu do Perfil e na busca |
| Perfil → Conta | exportar seus dados em JSON, apagar tudo |
| Status (`/status`) | sensor, push, IA e erros |

---

## 7. O que está escrito e **não** está no ar

| item | estado |
|---|---|
| Apelido "Addera" para vitamina D3 | migration escrita, **não aplicada** — precisa da sua autorização |
| Remover o `default now()` do adiamento | resíduo da correção de hoje; migration ainda não escrita |
| 8 substâncias suas fora da base | creatina, taurina, melatonina, magnésio B6, proteína de soja, Nustendi, Rusovas, Nezina Pio. **Decisão clínica, não minha:** pôr substância na base com zero interações é afirmar que alguém revisou |

## 8. O que **não** existe

| item | por quê |
|---|---|
| RIR / esforço percebido por série | não há coluna no banco |
| Qualidade de execução da série | idem |
| Dor e energia antes do treino | idem |
| Deltoide anterior/lateral/posterior separados | o vocabulário só tem "ombros" |
| Prontidão sistêmica (nota única) | é score composto — mesma decisão pendente abaixo |
| "Potencial de hipertrofia 78/100" | **decisão sua.** Média de sete componentes com três sem dado é número plausível e errado. Posso fazer com a regra "só aparece quando todos têm base" |
| ~~Sono~~ | **corrigido:** existe registro manual de sono em `/integracoes`, com prioridade sobre qualquer outra fonte do mesmo dia. O §8 original errava aqui |

## 9. Coisas que eu quebrei ou errei nesta leva — teste com atenção redobrada

1. **Adiar medicamento.** A migration de hoje deixou uma coluna obrigatória sem
   valor padrão e derrubou o adiamento em produção por alguns minutos. Corrigido
   e verificado, mas é o ponto que eu mais gostaria que você exercitasse.
2. **Botão de registrar dose.** Sumia em item com horário; corrigido em 07/09.
3. **Anel de recuperação muscular.** Mostrava grupo pausado como "recuperado".
4. **Contagem de mecanismos.** Contava 4 onde eram 5, por ignorar a insulina
   basal do dia anterior — que dura 24 h.
5. **Fuso horário (corrigido em 08/09).** Eram 42 formatações sem fuso: a linha
   do tempo mostrava +3 h, a dose das 19:00 aparecia como 22:00, e o dia em
   `/glicemia/<data>` começava às 03:04. Confira as horas em qualquer tela.
6. **Histórico preso em julho (corrigido em 08/09).** O Histórico de glicemia e
   os insights recebiam as **mil leituras mais antigas** da janela, em silêncio.
   Confira se o histórico agora chega a setembro.
7. **Estoque (corrigido em 08/09).** Sete itens diziam "pode ter acabado"; o que
   estava velho era a informação, não necessariamente o estoque.

---

Se algo aqui não bater com o que você vê, **o que você vê ganha**. Me diga a
tela, o que apareceu e o que você esperava.

---

**Riva's Alexandre**  © 2026
Todos os direitos reservados. Documento de uso interno do projeto GLYX.
