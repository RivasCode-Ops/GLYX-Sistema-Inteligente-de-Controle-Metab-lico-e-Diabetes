-- Rigidez de horário por item.
--
-- Nem tudo precisa ser tomado no minuto. Hoje o app trata insulina e creatina
-- com o mesmo rigor, o que produz alarme irrelevante no suplemento e dilui a
-- atenção do que é crítico.
--
-- O default por `kind` é PALPITE INICIAL, não regra: existe suplemento que
-- precisa ser rígido e medicamento que não precisa. O usuário troca item a item.

alter table public.medications
  add column if not exists timing_strictness text not null default 'flexivel'
    check (timing_strictness in ('rigido','flexivel','livre'));

-- Janela de tolerância própria do item. Nulo usa o padrão da rigidez
-- (rigido 60 min, flexivel 240 min, livre sem janela). Preenchido, vence.
alter table public.medications
  add column if not exists grace_minutes integer
    check (grace_minutes is null or (grace_minutes between 0 and 1440));

-- Backfill pelo kind existente. Restrito ao que ainda está no default, para a
-- migration poder rodar de novo sem desfazer ajuste que o usuário já tenha feito.
update public.medications
  set timing_strictness = 'rigido'
  where kind = 'med' and timing_strictness = 'flexivel';

-- `supplement` já cai no default 'flexivel'; o update existe só para deixar a
-- intenção explícita no arquivo em vez de depender do valor da coluna.
update public.medications
  set timing_strictness = 'flexivel'
  where kind = 'supplement' and timing_strictness = 'flexivel';

comment on column public.medications.timing_strictness is
  'rigido: janela 60min, alarme persiste, atraso conta. flexivel: janela 240min, alarme some após a janela. livre: sem horário — vira pergunta diária (tomou hoje?), sem alarme e sem snooze.';

comment on column public.medications.grace_minutes is
  'Janela de tolerância em minutos. Nulo = padrão da rigidez.';
