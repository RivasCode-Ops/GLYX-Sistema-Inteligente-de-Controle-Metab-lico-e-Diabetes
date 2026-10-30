# PRD — GLYX

> **Revisão técnica concluída em 15/10/2026** — conferido contra o código, as migrations e a validação
> local de 14–15/10. **Não aprovado pelo Rivas.** D1–D4 (medicação e exclusão) **aprovadas em 15/10** como regras de produto — `DECISOES-D1-D4.md`. Decisões pendentes que afetam este documento: D5 e D6 (envio de dados à IA e política), D7 (decisões clínicas), D8 e D9 (escopo de integrações e treino), D10 e D11 (relatório de sobreposição, revisão de exame por foto). Nenhum requisito marcado [decisão] está definido.

**Versão:** 0.1 (rascunho para revisão) · **Data:** 14/10/2026, conferido em 15/10/2026 · **Status:** revisado tecnicamente; aguardando aprovação do Rivas

> Este é o primeiro PRD do GLYX. Ele foi **reconstruído a partir do que já existe**, e não escrito
> antes do produto: README (Funcionalidades), ROADMAP, roteiro de teste, `CONTEXTO_TECNICO.md` e a
> auditoria de 14/10/2026. Cada requisito diz de onde veio.
>
> | Marca | Significa |
> |---|---|
> | **[comprovado]** | existe no código e há registro de verificação |
> | **[observado]** | existe no código ou na documentação, sem verificação registrada |
> | **[proposta]** | sugerido nesta revisão; só entra no escopo com aceite |
> | **[decisão]** | depende de decisão do Rivas (lista D1–D12 em `lista-implementacao-glyx.md`; nenhuma aprovada) |
> | **validado em teste local** | exercitado em banco local descartável com IA e push simulados; **não** é validação em produção |
>
> Bug não vira requisito: quando o código faz uma coisa e a documentação promete outra, o requisito
> segue a promessa e o desvio vai para a lista mestra.

## 1. Produto

App web (PWA) de **autocuidado metabólico e diabetes**, em português, para uso pessoal com cadastro
fechado por convite. Organiza registros e dá orientações gerais. **Não é dispositivo médico** e não
substitui avaliação profissional [observado — ROADMAP, README].

**Usuários:** pessoa com diabetes (tipo 1 ou 2) ou com meta corporal, que registra o próprio dado.
Hoje: uso individual e um segundo usuário autorizado [observado]. Cuidador e médico com acesso
próprio estão **fora** do escopo até decisão (ROADMAP P2.6).

**Objetivos:**
1. Reduzir o esforço de registrar glicemia, refeição, medicação e exercício.
2. Não deixar passar dose, hipoglicemia ou interação perigosa.
3. Levar ao médico um retrato fiel do período — sem número inventado.

**Princípios que já regem o código** [observado — comentários e testes]:
- O app **não recusa registro**: registro atrasado é informação; registro ausente é erro.
- **Ausência de dado não vira zero**, nem "seguro", nem "em dia".
- **Nenhum LLM emite veredito de segurança**: interação é decidida por regra fixa sobre base curada.
- **A IA não calcula dose.**

## 2. Escopo

### Dentro
Módulos e requisitos da seção 3.

### Fora (até nova decisão) — ROADMAP
Portal do médico/prontuário · WhatsApp API · Apple Health no navegador · classificação como software
médico (SaMD/ANVISA) · compartilhamento com cuidador · modelo de negócio.

## 3. Requisitos por módulo

Critério de aceitação entre parênteses quando já existe caso no roteiro de teste (`ROTEIRO-DE-TESTE.md`).

### 3.1 Glicemia e CGM
- R-GLI-1 Registrar leitura manual com data e hora [observado] (roteiro §3 "Registrar leitura manual").
- R-GLI-2 Sincronizar sensor Libre automaticamente, com proteção contra queda do provedor [comprovado — 15 dias estáveis, ROADMAP].
- R-GLI-3 Importar CSV do LibreView [observado].
- R-GLI-4 Mostrar a **idade** da última leitura; nunca exibir leitura velha como atual [observado] (roteiro §3).
- R-GLI-5 Histórico e tendências sobre **todas** as leituras do período [observado; corrigido 08/09].
- R-GLI-6 Dexcom [decisão D8; bloqueado por app aprovado].
- R-GLI-7 Pressão arterial [observado].

### 3.2 Medicação
- R-MED-1 Cadastrar medicamento ou suplemento, manualmente ou por foto do rótulo [observado].
- R-MED-2 Declarar **horários** e **frequência** (diária, semanal num dia, a cada N dias a partir de uma data) [observado: a coluna existe desde 07/09; o formulário passou a ter o campo em 14/10]. **D1 (aprovada em 15/10):** em cadastro novo com horário, a frequência é obrigatória e escolhida explicitamente; itens antigos mantêm o alarme como sempre e aparecem como "frequência a confirmar" até a pessoa confirmar por ação explícita; nada muda horário ou frequência de item antigo sozinho [implementado local, não implantado].
- R-MED-3 **Alarme push na hora certa e só nos dias de dose** [observado — a promessa existe; o desvio era GLYX-07]. **D2 (aprovada):** o intervalo conta da data de início escolhida, não dispara antes dela, e a tela avisa quando o início está no futuro [implementado local].
- R-MED-4 Alarme crítico para medicamento [observado]. Item de rigidez "livre": o comentário da coluna diz "sem alarme", mas nenhuma tela permite escolher "livre" e o alarme antigo tocava para ele — **D3 (aprovada):** "livre" com horário é configuração inconsistente — não recebe alarme implícito, a tela mostra a inconsistência, e o alarme só é ativado com escolha explícita de frequência e programação; nenhuma tela nova de "uso livre" [implementado local].
- R-MED-5 Adiar dose até 3 vezes; depois, só "Registrei" ou "Pulei hoje" [observado] (roteiro §2).
- R-MED-6 Registrar dose (tela ou notificação) **sem duplicar a mesma dose** [observado] (roteiro §2 "não duplica").
- R-MED-7 Registro atrasado é aceito e rotulado [observado] (roteiro §2).
- R-MED-8 Adesão do dia: travessão antes da primeira dose vencer; dia sem dose não conta [observado] (roteiro §2).
- R-MED-9 Estoque e aviso de reposição [observado].
- R-MED-10 Calculadora de bolus **educativa**, sem gravar dose, bloqueada em hipoglicemia [observado]. Teto de dose [decisão D7].

### 3.3 Segurança clínica
- R-SEG-1 Checar interação suplemento × medicamento por regra fixa sobre base curada [comprovado — 08/09] (roteiro §1.1, §1.2).
- R-SEG-2 Nunca mostrar "seguro" nem card verde; substância desconhecida é dita como desconhecida [observado] (roteiro §1.1).
- R-SEG-3 Plano de hipoglicemia **do usuário**, sem valor padrão escolhido pelo app [observado] (roteiro §6).
- R-SEG-4 Não sugerir exercício quando houver risco de hipoglicemia [observado].
- R-SEG-5 Curadoria das substâncias fora da base [decisão D7].

### 3.4 Alimentação, Exames, Exercício, Composição
- R-ALI-1 Refeição manual, por texto e por foto, **sempre revisada antes de salvar** [observado] (roteiro §4).
- R-ALI-2 Água e bebidas, com só bebida hidratante na meta [observado] (roteiro §4).
- R-EXA-1 Exame por texto/foto/PDF com interpretação educativa [observado]. Revisão antes de gravar [proposta — GLYX-22].
- R-EXA-2 Valores por analito e série no tempo [observado].
- R-EXE-1 Sessões, plano, catálogo, recuperação e evolução [observado] (roteiro §5).
- R-EXE-2 RIR/RPE, execução, dor/energia, camada anatômica, score composto [decisão D9].
- R-COM-1 Medidas, fotos (IA só sob pedido), metas e veredito [observado] (roteiro §6).

### 3.5 Análise e relatórios
- R-ANA-1 Auditoria metabólica e resumo semanal sobre **todo** o período; dado incompleto **não vira número** [observado; corrigido no código em 14/10 e validado em teste local — GLYX-16; não implantado].
- R-ANA-2 Relatório para o médico com o aviso de idade da auditoria [observado] (roteiro §6).
- R-ANA-3 Marcador de evento (início de suplemento etc.) com comparação antes/depois [observado — tabela existe; tela falta, GLYX-37].

### 3.6 Copiloto de IA
- R-IA-1 Chat com o contexto do usuário, declarando o que não foi registrado [observado].
- R-IA-2 O usuário não altera as instruções de sistema [observado; corrigido no código em 14/10 e validado em teste local com IA simulada — GLYX-26; não implantado].
- R-IA-3 Limite de uso por hora que o usuário não consegue zerar [observado; corrigido no código em 14/10 e validado em teste local — GLYX-24; migration não aplicada em produção].
- R-IA-4 Resposta interrompida ou truncada é sinalizada [observado].

### 3.7 Conta, privacidade e operação
- R-CON-1 Cadastro só por convite [comprovado — 14/08].
- R-CON-2 Conta desativada perde acesso a **tudo**, inclusive pelo banco direto [observado; corrigido no código em 14/10 e validado em teste local — GLYX-23; migration não aplicada em produção].
- R-LGPD-1 Exportar **todos** os dados, sem corte silencioso [observado; corrigido no código em 14/10 e validado em teste local — GLYX-15/16; não implantado].
- R-LGPD-2 Apagar **todos** os dados clínicos e fotos; a conta de login permanece [observado; corrigido no código em 14/10 e validado em teste local]. **D4 (aprovada):** a exclusão apaga também todo o histórico individual de uso de IA; isso reinicia a cota individual por hora (consequência aceita). Não há teto global de gasto que bloqueie chamadas — só o medidor do painel admin, que deixa de contar o que foi apagado [implementado local; conflito informado em `DECISOES-D1-D4.md`].
- R-LGPD-3 Política de privacidade que diga quais dados vão a qual provedor e onde [observado no DPIA; texto pendente — D5, D6]. Envio automático de glicemia à IA sem ação do titular: [`P06-ENVIO-AUTOMATICO-IA.md`](P06-ENVIO-AUTOMATICO-IA.md).

## 4. Critérios de "pronto para beta mais amplo" (ROADMAP)

| Critério | Estado em 15/10/2026 |
|---|---|
| `check:prod` verde nas obrigatórias | não verificado |
| Migrations e secrets de produção aplicados | não verificado; **4 migrations novas não aplicadas em produção** (validadas só em banco local descartável) |
| Signup fechado + convite | aprovado (14/08) |
| Exclusão e exportação exercitadas em conta real | **validadas em teste local** com conta sintética (14/10); em conta real: pendente |
| Sentry recebendo erros de cron | pendente |
| Um sensor estável por 7 dias | aprovado (13/08) |

## 5. Decisões pendentes que afetam este documento

D1–D12 em [`lista-implementacao-glyx.md`](lista-implementacao-glyx.md) §D; D1–D4 detalhadas em
[`DECISOES-D1-D4.md`](DECISOES-D1-D4.md). **D1–D4 aprovadas em 15/10; as demais, não.** As de maior efeito no escopo: D5/D6 (consentimento e transparência da IA), D7 (decisões clínicas), D8 (Dexcom/Google Fit),
D9 (briefing de hipertrofia).

---

**Riva's Alexandre**  © 2026
Todos os direitos reservados. Rascunho de PRD para revisão.
