# Plano de treino, alimentação e acompanhamento

> **Validar com médico/endocrinologista antes de iniciar.** Este plano foi montado a partir de um
> perfil individual e envolve diabetes em medicação — mudanças de treino e de ingestão calórica
> afetam glicemia e podem exigir ajuste de dose. Nada aqui substitui orientação clínica.

## Perfil de referência

| Item | Valor |
|------|-------|
| Idade / sexo | 56 anos, masculino |
| Altura / peso | 179 cm · 76 kg |
| Condição | Diabético em medicação |
| Nível | Intermediário |
| Disponibilidade | 5x/semana (dias úteis), 50 min/sessão |
| Estrutura | Academia completa |
| Lesões | Nenhuma |
| Alimentação | Não vegetariano |
| Suplementos em uso | Creatina, taurina, vitamina D3 |

## 1. Treino

Dividido por padrão de recuperação muscular: grupos grandes 2x/semana, abdômen/panturrilha/antebraço
com frequência maior (recuperam mais rápido). A ordem dos dias evita concentrar o mesmo grupo em
dias consecutivos.

| Dia | Treino | Foco |
|-----|--------|------|
| Segunda | Inferior A | Quadríceps e panturrilha |
| Terça | Superior A | Peito, ombro e tríceps |
| Quarta | Inferior B | Posterior de coxa e panturrilha |
| Quinta | Superior B | Costas e bíceps |
| Sexta | Full body leve + braços | Volume leve de corpo inteiro, ênfase em braços |
| Sábado / Domingo | Descanso | Recuperação |

### Padrão de carga

- **Intensidade:** 70-80% de 1RM
- **Esforço:** RIR 1-2 (parar 1-2 repetições antes da falha)
- **Descanso:** 60-90s entre séries
- **Progressão:** subir a carga ao fechar o topo da faixa de repetições com técnica limpa

### O calendário é proposta, a recuperação é que manda

Este split está implementado em [`lib/exercicios/training-plan.ts`](../lib/exercicios/training-plan.ts)
e aparece em `/exercicios/plano`. A tabela acima é a **intenção** — o que o app sugere de fato sai do
motor de recuperação muscular que o GLYX já usa:

- Grupo ainda dentro da janela de recuperação (ou pausado manualmente) não entra no treino do dia.
- Se **todos** os grupos do dia agendado estiverem saturados, o app antecipa outro dia do plano —
  aquele com maior atraso acumulado, mesmo critério de `suggestMuscleSplit`.
- O treino é cortado pelo tempo disponível: 50 min cabe cerca de 2 grupos bem feitos.
- Sem nada recuperado, a sugestão é descanso ou aeróbico leve, não musculação.

Ou seja: seguir segunda/terça/quarta é o padrão, mas uma semana atípica (viagem, dor, treino extra)
reorganiza o plano sozinha em vez de empurrar carga sobre músculo que não recuperou.

### Glicemia e treino

Treino resistido intenso pode **subir** a glicose temporariamente (adrenalina); aeróbico tende a
**baixar**. Medir antes e depois nas primeiras semanas para aprender o padrão individual de resposta,
sem corrigir por conta própria.

## 2. Plano alimentar

Superávit calórico moderado, com carboidratos de baixo índice glicêmico por causa do diabetes.

- **Meta calórica:** ~2.800-2.900 kcal/dia
- **Proteína:** ~150 g/dia
- **Carboidrato:** priorizar baixo índice glicêmico
- **Refeições:** café da manhã, lanche, almoço, pré-treino, pós-treino, jantar, ceia — com opções de
  substituição em cada uma

> As quantidades acima são um ponto de partida. Ajuste calórico em diabetes deve ser acompanhado por
> nutricionista, com monitoramento glicêmico.

## 3. Suplementação

| Suplemento | Situação |
|------------|----------|
| Creatina | Manter — 5 g/dia |
| Vitamina D3 | Manter |
| Whey protein | Usar para fechar a meta de proteína |
| Taurina | Benefício limitado para hipertrofia |
| Multivitamínico | Considerar |
| Ômega-3 | Considerar |

## 4. Acompanhamento

- **Peso:** semanal, mesmo dia e horário
- **Fotos:** a cada 1-2 semanas, mesma luz e pose
- **Medidas de fita:** a cada 2 semanas
- **Cargas por exercício:** registrar toda sessão — é o indicador mais confiável de progresso
- **Comparação visual:** a cada 4 semanas

O registro de cargas já existe no app em `/exercicios/recuperacao` (Progressão de carga).
