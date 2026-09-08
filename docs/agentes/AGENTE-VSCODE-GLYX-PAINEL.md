# AGENTE-VSCODE-GLYX-PAINEL

Briefing de implementação — GLyX, redistribuição do Painel metabólico.
Base: captura de 07/09/2026, 980 × 1806 px, fundo `#09090b`.
Integra com as fatias 3 (recibo), 4 (card de ação) e 6 (contas fora do painel).

---

## 0. Critério único

**O painel responde uma pergunta: o que eu faço agora.**

Tudo que não responde isso vai para o módulo correspondente ou para
configurações. Nada é apagado — é realocado.

Segundo critério, subordinado ao primeiro: **cada dado aparece uma única vez na
tela.** Repetição não reforça, dilui — quando o mesmo número aparece em quatro
lugares, o usuário para de ler todos.

---

## 1. Repetição medida

| dado | ocorrências hoje | onde deve ficar |
|---|---|---|
| 165 mg/dL | 2 | card de glicemia |
| 0 g carboidrato | 3 | linha do módulo Alimentação |
| 0 min de atividade | 2 | linha do módulo Exercícios |
| 0/2807 ml de água | 2 | linha do módulo Alimentação |

Regra derivada: **a coluna direita da lista MÓDULOS é a única fonte dos números
do dia.** O card de glicemia mostra só glicemia. Nenhum card auxiliar repete
valor que já está na lista.

---

## 2. Nova ordem do painel

```
1  Faixa de sensor          (fina, uma linha)
2  Card de ação             (fatia 4 — largura total)
3  Glicemia agora           (card único, enxuto)
4  MÓDULOS                  (lista — única fonte dos números do dia)
5  Recibo de contexto       (fatia 3 — colapsado, fechado)
6  Rodapé
```

Altura estimada após a redistribuição: em torno de 900 px contra os 1806 px
atuais. O painel passa a caber numa tela sem rolagem no desktop.

### 1. Faixa de sensor

Mantém como está — `Sensor ativo · última leitura há 2 min · ver auditoria`.
Sobe para o topo absoluto, acima de tudo. É o estado da fonte de dado principal;
se ela caiu, nada abaixo vale.

### 2. Card de ação

Substitui o card de dica atual. Largura total, topo. Regras e prioridades na
fatia 4.

O card de dica existente já é um embrião disso, mas com dois defeitos:

- está montado sobre o número errado — afirma "nenhuma atividade hoje" enquanto
  o módulo registra `Inferior A`
- sugere caminhada sem verificar insulina rápida ativa

A guarda `exerciseSuppressed` da fatia 4 resolve os dois. Enquanto a fatia 4 não
entrar, **remover a sugestão de exercício do card de dica** — sugerir atividade
sem checar insulina ativa é o risco que a fatia 4 existe para fechar.

### 3. Glicemia agora — enxugado

Fica:
- valor, unidade, tendência (`165 mg/dL ↗ acima da meta`)
- sparkline
- badge de faixa — **com a escala declarada**: hoje diz `Moderado` sem dizer
  moderado em relação a quê. Trocar por referência explícita à faixa alvo
  configurada, ex.: `acima da meta (70–140)`
- ação: `Registrar leitura`

Sai:
- as três sub-métricas `Carboidratos 0g`, `Atividade 0 min`, `Água 0/2807ml` —
  todas repetem a lista de módulos
- `Insulina extra` como botão primário — ver seção 4

### 4. MÓDULOS

Mantém as sete linhas. Duas correções:

**Cabeçalho.** Remover `Atividade hoje: 0 min` do canto direito. É o número que
contradiz a própria linha de Exercícios, e a linha já carrega o dado.

**Coluna direita.** Passa a ser a fonte única dos números do dia, e adota os três
estados do recibo (fatia 3):

```
Glicemia      165 mg/dL
Alimentação   —              ← nao_registrado, NÃO "0 g carb"
Exercícios    Inferior A · 0 min ⚠
Medicação     3 de 4 hoje
Exames        Lab · ECG · Raio-X
Análise       Risco · correlações
Integrações   Conectar fontes
```

Travessão para `nao_registrado`. Marca de divergência quando duas fontes da
mesma grandeza discordam. Zero só aparece quando é zero confirmado.

### 5. Recibo de contexto

Colapsado, fechado por padrão, conforme fatia 3.

---

## 3. O que sai do painel e para onde vai

| bloco atual | destino | motivo |
|---|---|---|
| Banner "Outra conta tem acesso" | Configurações → Acessos | administrativo; ocupa a melhor posição da tela com evento de um mês atrás |
| Card "Água e bebidas hoje" completo (6 botões, nota de rodapé) | módulo Alimentação | registro, não decisão; no painel resta a linha do módulo |
| Quatro medidores "Consumo de hoje" | módulo Alimentação | ocupam ~20% da altura para exibir quatro zeros que significam "sem registro" |
| Lista "Alertas recentes" (3 itens) | módulo Análise | histórico; alerta que ainda exige ação vira card de ação |
| Link "Análise — auditoria metabólica" | remover do painel | duplica a linha do módulo Análise |

**Alertas — regra de transformação.** Alerta que ainda pede ação sobe como card
de ação. Alerta já resolvido ou informativo desce para Análise. O painel não
mantém lista de alertas; ele mostra no máximo o que está aberto.

Os três alertas atuais também precisam de correção própria:
- `Glicemia no limite inferior` aparece duas vezes, idêntico — deduplicar por
  `(slug, janela)`
- nenhum tem horário — todo alerta exibe hora de origem, senão não é acionável

---

## 4. `Insulina extra` — confirmação obrigatória

Hoje é botão primário no card principal, a um toque.

Registro falso de insulina não é erro cosmético: ele entra no cálculo de janela
de sobreposição da fatia 5 e desloca a leitura de mecanismos concentrados. Um
toque acidental corrompe o dado que a camada de segurança usa.

Correção:
- sai da posição primária do card de glicemia
- vira ação secundária, com passo de confirmação exibindo o que será gravado
  (tipo, quantidade e horário) antes de confirmar
- alternativa aceitável: permanece no painel como atalho que **abre o formulário**
  do módulo Medicação, sem gravar nada por si

Nada aqui envolve cálculo ou sugestão de dose. É registro do que o usuário
informa.

---

## 5. Bugs de layout medidos

**Botão Copiloto sobrepõe texto.** Na captura, o botão flutuante cobre
`Atividade hoje: 0 min` no cabeçalho de MÓDULOS. Com a remoção desse texto
(seção 2) a colisão some, mas o botão precisa de margem de segurança declarada e
não pode flutuar sobre conteúdo em nenhuma largura. Testar em 390, 768 e 1440.

**Sidebar sem separação de superfície.** Sidebar e conteúdo usam o mesmo
`#09090b`; só uma borda de 1px separa. [medido] Aplicar `background-100` na
sidebar conforme os tokens do design system, para que a hierarquia não dependa
de uma linha.

---

## 6. Navegação — dois mapas que não batem

Divergências entre a sidebar e a lista MÓDULOS:

| item | sidebar | MÓDULOS |
|---|---|---|
| Composição | REGISTRAR | ausente |
| Integrações | ausente | presente |
| Exames | CONTA | presente |
| Análise | ANÁLISES | presente |

Correção: **a lista MÓDULOS e a seção de registro da sidebar passam a ter
exatamente os mesmos itens, na mesma ordem.** A lista no painel é a versão com
valores; a sidebar é a versão de navegação. Divergir entre as duas obriga o
usuário a aprender dois mapas.

Reagrupamento da sidebar:

```
REGISTRAR    Hoje · Glicemia · Alimentação · Medicação · Exercícios · Composição
CONSULTAR    Exames · Análise · Integrações
CONTA        Perfil · Acessos · Configurações · Sair
```

`Exames` sai de CONTA — é dado clínico, não administrativo. `Acessos` entra em
CONTA, recebendo o banner removido do painel.

---

## 7. Testes

**Unicidade**
- nenhum valor numérico do dia aparece em mais de um lugar do painel
- varredura: renderizar o painel com fixture e contar ocorrências de cada valor

**Estados**
- fonte sem registro → travessão, nunca `0`
- divergência entre fontes → marca visível, sem escolher um dos valores

**Alertas**
- dois alertas de mesmo slug na mesma janela → renderiza um
- todo alerta renderizado tem horário

**Layout**
- botão flutuante não intersecta nenhum elemento de conteúdo em 390, 768 e 1440

**Navegação**
- itens da seção REGISTRAR da sidebar são idênticos, e na mesma ordem, aos da
  lista MÓDULOS

**Segurança**
- `Insulina extra` não grava sem confirmação explícita

---

## 8. Ordem de execução

1. Mover o banner de acessos para Configurações — libera o topo.
2. Remover as três sub-métricas do card de glicemia e o `Atividade hoje` do
   cabeçalho de MÓDULOS — elimina a repetição e a contradição.
3. Mover medidores de macro e card de bebidas para o módulo Alimentação.
4. Mover alertas para Análise, com deduplicação e horário.
5. Remover a sugestão de exercício do card de dica até a fatia 4 entrar.
6. Confirmação em `Insulina extra`.
7. Reagrupar a sidebar e alinhar com MÓDULOS.
8. Superfície da sidebar e margem do botão flutuante.
9. **Parar.** Produção depende de autorização explícita do Rivaldo.

---

*Riva's Alexandre*
