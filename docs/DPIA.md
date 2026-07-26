# DPIA enxuta — GLYX (LGPD)

**Documento interno** · Avaliação de Impacto à Proteção de Dados pessoais  
Versão: 1.0 · Data: 2026-07-15  
Controlador / responsável de contato: rivaldo.alexandre.ra@gmail.com  
Base legal principal: **consentimento** (art. 7º, I e art. 11, I — dados de saúde).

> Isto não substitui parecer jurídico formal. Serve como mapa operacional para o time e auditoria futura.

## 1. O que é o tratamento

O GLYX permite que a pessoa titular registre e visualize dados de saúde metabólica (glicemia, alimentação, medicação, exercício, exames, peso/água) e, sob demanda, envie trechos desses dados a um provedor de IA para respostas educativas.

**Finalidade:** organização pessoal, alertas e orientações gerais — **não** diagnóstico, prescrição ou dispositivo médico.

## 2. Categorias de dados

| Categoria | Exemplos | Sensível (LGPD)? |
|-----------|----------|------------------|
| Identificação | e-mail, nome, id Auth | Não (pessoal) |
| Saúde | glicemia, CGM, refeições, exames, meds, atividade | **Sim** |
| Composição corporal | medidas de fita, dobras cutâneas, metas | **Sim** |
| Imagem corporal | fotos de progresso (frente/costas/perfis) | **Sim** — ver §6 |
| Credenciais de terceiros | senha LibreLinkUp / tokens Dexcom (cifrados) | Sim (acesso a saúde) |
| Técnicos | push endpoints, uso de IA (tokens), logs de erro | Parcial |
| Não coletados | geolocalização contínua, biometria, dados de terceiros sem consentimento | — |

## 3. Titulares e fluxos

- **Titular:** usuário final convidado (adulto autocuidado).
- **Não há** papéis de médico/cuidador com acesso cruzado no produto atual.
- **Cadastro:** convite + consentimento explícito na UI de registro.
- **IA:** processamento só quando o titular aciona a função (foto, chat, exame, etc.).
- **Fotos de progresso corporal:** ficam no Storage privado e **não** são enviadas à IA por padrão. Só saem do servidor quando o titular pede explicitamente a comparação de duas fotos (`/api/ai/body-photo-compare`), com aviso na tela antes do botão. Nenhum job de fundo lê esse bucket.

## 4. Sistemas e operadores

| Sistema | Papel | Região / nota |
|---------|-------|----------------|
| Supabase (Postgres, Auth, Storage, cron) | Hospedagem + isolamento RLS | São Paulo (configurado) |
| Vercel (ou similar) | App Next.js | Conforme projeto |
| Moonshot AI (Kimi K2.6) | Processamento de conteúdo sob demanda | Pode ser fora do BR — informar na privacidade |
| LibreLinkUp / Dexcom | Fonte de CGM sob autorização do titular | Terceiros; canais oficiais ou semi-oficiais |
| Sentry (opcional) | Erros e alertas ops | Sem PHI bruto proposital; extras truncados |

## 5. Medidas de segurança (estado atual)

- Isolamento **RLS** por `auth.uid()` nas tabelas clínicas
- Storage privado (fotos de refeição / rótulo / progresso corporal) com pasta por usuário e URL assinada de 1 h
- Credenciais CGM com **AES-256-GCM** (`CGM_CREDENTIALS_SECRET`)
- Signup público desligável; cadastro via Admin API + convite
- Rate-limit de IA **fail-closed**
- Circuit breaker no sync CGM (reduz abuso e exposição a APIs instáveis)
- Export JSON com redação de `credentials_enc`; wipe amplo de tabelas + Storage
- Conta Auth não é autoapagada no wipe (canal humano) — **residual consciente**

## 6. Riscos e mitigação

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Vazamento de dados de saúde | Alto | RLS, Storage privado, mínimo no Sentry, HTTPS |
| Processamento de IA no exterior | Médio–alto | Transparência na política; não enviar sem ação do usuário; DPA com provedor |
| API Libre não oficial quebra / vaza | Médio | Circuit breaker, CSV fallback, alerta ops |
| Wipe incompleto (históricos) | Alto | Inventário em `lib/privacy/user-data.ts` + teste RLS/LGPD |
| Bypass de convite | Médio | Fechar signup Auth + SERVICE_ROLE no register |
| Over-trust em alertas/IA | Médio | Disclaimer médico repetido; tom educativo |
| Foto de corpo enviada à IA | **Alto** | Envio só por ação explícita, duas fotos por vez, aviso antes do botão, nenhum job automático; prompt proíbe estimar peso/gordura por imagem e comentário estético; limite de 5 chamadas/h |
| Estimativa de gordura lida como exame | Médio | Método sempre exibido junto do número; comparação entre métodos diferentes bloqueada em código (`sameMethod`); erro de 3-4 pontos declarado na tela |

## 7. Necessidade e proporcionalidade

- Tratamento limitado ao necessário para o serviço solicitado pelo titular.
- Sem venda de dados / marketing.
- Sem perfilagem comercial.
- Insights e IA são assistenciais, não prescritivos.

## 8. Direitos do titular (como exercer)

| Direito | Como |
|---------|------|
| Acesso / portabilidade | Export JSON no perfil |
| Eliminação dos registros de saúde | “Apagar todos os meus dados” no perfil |
| Eliminação da conta Auth | E-mail ao responsável |
| Revogação do consentimento | Parar de usar + wipe + eventual exclusão Auth |
| Informação | `/privacidade` |

## 9. Decisão resumida

O tratamento de dados sensíveis de saúde **só se justifica** com consentimento informado, finalidade educativa clara e controles técnicos (RLS, cifra, wipe).  
**Go** para beta fechado desde que: secrets/migrations de produção aplicados, Auth signup fechado, Sentry ligado, e política de privacidade alinhada a qualquer mudança de operador de IA ou região.

## 10. Revisão

Revisar este DPIA quando houver: novo papel (cuidador/clínica), novo operador de dados, mudança de região Supabase, submissão regulatória, ou compartilhamento com terceiros além dos já listados.

Próxima revisão sugerida: **2026-10-15** ou antes se o escopo mudar.
