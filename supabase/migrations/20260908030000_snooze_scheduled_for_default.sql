-- CORRETIVA, aplicada minutos depois de 20260907132000_snooze_invariants.
--
-- O QUE QUEBROU: aquela migration pôs `medication_snoozes.scheduled_for` como
-- NOT NULL SEM DEFAULT. O código que estava em produção no momento da aplicação
-- — o da `main`, anterior a esta leva — insere na tabela com apenas
-- (user_id, medication_id, snoozed_until). Todo adiamento passou a falhar no
-- instante em que a migration entrou, e voltou a funcionar quando esta entrou.
--
-- O ERRO DE RACIOCÍNIO ESTAVA NO RUNBOOK, NÃO NO SQL. O `docs/PRODUCAO.md` §2.1
-- classificava as sete como "aditivas — nenhuma apaga ou reescreve dado
-- existente". A frase é verdadeira sobre o DADO e não diz nada sobre o CÓDIGO:
-- uma coluna NOT NULL sem default é aditiva para o dado e incompatível com todo
-- código que já grava naquela tabela. A regra "migration antes do deploy" só
-- vale para migration que o código ANTERIOR tolera; quando não tolera, a coluna
-- entra permissiva, o código sobe, e só então ela aperta.
--
-- `now()` é aproximação assumida e serve só à ponte: quem clica em adiar faz
-- isso quando o alarme toca, perto do horário previsto. O código atual passa
-- `scheduled_for` explicitamente e nunca cai no default.
alter table public.medication_snoozes
  alter column scheduled_for set default now();

comment on column public.medication_snoozes.scheduled_for is
  'Horário previsto que este adiamento empurra. Conta tentativas por dose e faz o adiamento morrer com o dia. O default now() é ponte para o código anterior a 08/09/2026, que insere sem esta coluna; o código atual sempre passa o valor explícito.';
