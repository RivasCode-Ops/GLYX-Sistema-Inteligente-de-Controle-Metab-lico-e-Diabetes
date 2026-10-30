# Fluxo do aplicativo — GLYX

> **Revisão técnica concluída em 15/10/2026** — conferido contra o código, as migrations e a validação
> local de 14–15/10. **Não aprovado pelo Rivas.** D1–D4 aprovadas em 15/10. Decisões pendentes que afetam este documento: D5 e D13 (sugestão automática de refeição). A2 executada em 30/10/2026: os fluxos do lote 1 estão em produção.

**Data:** 14/10/2026 · **Fonte:** `lib/navigation.ts` e `app/**/page.tsx` (lidos nesta data)

## 1. Navegação

Nove destinos principais, em dois grupos, mais os de conta. Fonte: `lib/navigation.ts`.

| Grupo | Destino | Rota | Abas |
|---|---|---|---|
| Registrar | Hoje | `/dashboard` | — |
| | Glicemia | `/glicemia` | Visão geral · Histórico · Pressão |
| | Alimentação | `/alimentacao` | Refeições · Por foto · Montar prato |
| | Medicação | `/medicacao` | Doses de hoje · Meus medicamentos · Interações · Calculadora |
| | Exercícios | `/exercicios` | Visão geral · Plano · Recuperação · Evolução · Catálogo |
| | Composição | `/composicao` | Resumo · Medidas · Fotos · Metas · Histórico |
| Análises | Análise | `/analise` | Resumo · Semana · Correlações · Linha do tempo · Alertas |
| Conta | Perfil | `/perfil` | Metabólico · Corpo & peso · Hipoglicemia · Conta |
| | Exames | `/exames` | Documentos · Resultados |
| | Conexões | `/integracoes` | — |
| | Sistema | `/status` | — |
| | Ajuda | `/ajuda` | — |

**Copiloto de IA:** chat flutuante em todas as telas autenticadas (`/ia-metabolica` também existe
como página). **Públicas:** `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`,
`/privacidade`, `/instalar`, `/risco`, `/conta-desativada`. **Fora do menu:** `/relatorio-medico`,
`/relatorio-completo`, `/admin` (só admin). Rotas antigas (`/mapa-risco`, `/insights`, `/historico`,
`/alertas`, `/medicacao/agenda` etc.) redirecionam.

## 2. Camadas de uma ação

```
Tela (Server Component) ─▶ Server Action / Route Handler
                              │ getUser() · zod · regra em lib/
                              ▼
                         Supabase com o token do usuário (RLS)
                              │
                 pg_cron ─▶ funções SQL (quem/quando) ─▶ pg_net ─▶ /api/*/dispatch (entrega)
```

## 3. Fluxos críticos

### 3.1 Alarme de medicação (lote 1 implantado em 30/10: código e migration no ar; validado em teste local com push simulado; entrega real no aparelho ainda não validada)
1. A cada 5 min, `pg_cron` chama `dispatch_med_alarms()`.
2. `med_alarms_due(now())` lista as doses vencidas há menos de 10 min, **só nos dias de dose** da
   cadência, ignorando rigidez "livre", conta desativada e horário inválido; considera hoje e ontem
   (virada da meia-noite). Frequência nula continua diária (D1: o alarme dos antigos não muda);
   "livre" com horário não toca (D3) — [`DECISOES-D1-D4.md`](DECISOES-D1-D4.md).
3. Cada dose entra em `push_dispatch_log` como `pendente` (o `unique` impede duplicata).
4. O despachante **reivindica** pendentes, falhos e "enviando" sem confirmação há mais de 4 min
   (`for update skip locked`, até 3 tentativas, validade de 30 min) e chama `/api/push/dispatch`.
5. A rota entrega a cada aparelho e **confirma** no banco: `enviado`, `falhou` (reenvia) ou
   `sem_assinatura`.
6. No aparelho, a notificação tem tag por dose: dois remédios no mesmo horário não se substituem, e
   um reenvio duplicado se funde.
7. "Já tomei" envia a dose anunciada para `/api/medications/taken`, que usa a mesma regra da tela e
   não grava a mesma dose duas vezes. **Não reproduzível localmente**: o toque em "Já tomei" na
   notificação do sistema só se valida num aparelho.

### 3.2 Registro de dose pela tela (revisto em 15/10 — D14/P45; validado localmente, não em banco real)
"Doses de hoje" → `logMedicationTaken` (com o **pedido** do formulário) → `registrarDose`:
1. mesmo pedido já gravado → "já registrado", nada novo (reenvio);
2. dose ainda sem tomada → grava com rótulo e dose prevista;
3. dose já com tomada e pedido diferente → **nada é gravado**; `/medicacao` pergunta: corrigir aquela
   tomada (a linha muda e o valor anterior fica no histórico) ou registrar outra tomada (rótulo
   `adicional`, sem dose prevista).
Pelo "Já tomei" da notificação, o caso 3 volta como 409 e uma notificação leva à mesma pergunta.
Dia sem dose pela cadência não aparece nem conta na adesão. Pela tela, a ação **devolve** o destino
(pergunta, motivo da falha, login) e o navegador navega — sem `redirect()` depois da ação, que no build
de produção nem sempre navegava (medido em 15/10).

### 3.3 Checagem de suplemento
Texto ou foto → (foto: IA só extrai o rótulo) → motor determinístico decide → IA só redige, e só se
não houver alerta grave.

### 3.4 Exportar / apagar meus dados
`/perfil/conta` → exportação paginada por tabela, com lista de tabelas incompletas no topo do JSON →
ou exclusão: fotos (paginado), tabelas do inventário, **todo** o `ai_usage` (apagado pelo servidor, só
nesta exclusão — D4), limpeza do perfil. A conta de login permanece e a mensagem "todos os seus registros
foram apagados" passou a ser verdadeira (P39 resolvido). A cota de IA por hora reinicia (aceito na D4).

### 3.4b Cadastro e edição de remédio (D1–D3, aprovadas em 15/10; implementado local)
Cadastro com horário exige escolher a frequência (manual e por foto); recusa aparece ao lado do
formulário. Item antigo mostra "frequência a confirmar" e o botão "Está certo: …" (confirma sem mudar
nada). Intervalo com início no futuro mostra "Primeira dose em …". Item "livre" com horário mostra
"configuração inconsistente"; o alarme só é ativado escolhendo frequência **e** programação na edição.

### 3.5 Conta desativada
Admin desativa → `profiles.disabled = true` + banimento no Auth. O middleware redireciona e responde
403 na API; a policy restritiva `conta_ativa` barra o token já emitido no banco e no Storage; o
banimento barra refresh e login. Validado em teste local (14/10). Se o banimento falhar, a tela do admin
agora mostra o aviso (antes, a falha passava em silêncio — P37).

---

**Riva's Alexandre**  © 2026
Todos os direitos reservados. Mapa de navegação e fluxos do GLYX.
