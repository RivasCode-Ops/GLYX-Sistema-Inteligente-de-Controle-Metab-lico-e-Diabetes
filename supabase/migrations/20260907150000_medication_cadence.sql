-- Cadência: com que frequência o item é tomado.
--
-- POR QUE EXISTE: `reminder_times` diz A QUE HORAS, e nada diz EM QUE DIAS. O
-- contador de sobreposição (`lib/safety/overlap.ts`) projeta doses dos dias
-- anteriores para não perder a insulina basal de 24 h — e, sem cadência, ele
-- projetava TUDO como diário. Um GLP-1 semanal (168 h de janela no seed) era
-- contado como se houvesse uma aplicação por dia: sete doses onde há uma.
--
-- Isso erra para o lado do alarme falso, que é o outro jeito de um alerta
-- clínico parar de ser lido.
--
-- SEM CADÊNCIA DECLARADA, NÃO SE PROJETA. Item cuja frequência o app não sabe
-- entra no cálculo apenas com a dose do próprio dia. É a única postura honesta:
-- projetar seria inventar aplicações que talvez não tenham acontecido.

alter table public.medications
  add column if not exists cadence text
    check (cadence is null or cadence in ('diaria', 'semanal', 'intervalo'));

-- 0 = domingo … 6 = sábado, alinhado com `extract(dow)` do Postgres e com
-- `Date.getDay()` do JS — os dois lados que leem esta coluna.
alter table public.medications
  add column if not exists cadence_weekday smallint
    check (cadence_weekday is null or cadence_weekday between 0 and 6);

alter table public.medications
  add column if not exists cadence_interval_days smallint
    check (cadence_interval_days is null or cadence_interval_days between 2 and 90);

-- Data de referência do intervalo: a partir dela se conta de N em N dias.
alter table public.medications
  add column if not exists cadence_anchor_on date;

-- Cadência pela metade é pior que cadência ausente: 'semanal' sem dia da semana
-- e 'intervalo' sem intervalo seriam lidos como declarados e não teriam como
-- ser calculados.
alter table public.medications
  add constraint medications_cadence_completa check (
    cadence is distinct from 'semanal' or cadence_weekday is not null
  );

alter table public.medications
  add constraint medications_cadence_intervalo_completo check (
    cadence is distinct from 'intervalo'
      or (cadence_interval_days is not null and cadence_anchor_on is not null)
  );

-- ---------------------------------------------------------------------------
-- Backfill — e por que 'diaria' aqui NÃO é presunção
-- ---------------------------------------------------------------------------
-- Item com `reminder_times` já é tratado como diário pelo app inteiro: o
-- despachante de alarmes (`dispatch_med_alarms`) dispara todo dia em que a hora
-- local bate com um dos horários, sem olhar dia da semana. Marcar 'diaria' é
-- registrar o comportamento que já existe, não adivinhar um novo.
--
-- Item SEM `reminder_times` fica com cadência nula de propósito: é uso conforme
-- necessidade, e não há frequência a declarar.
update public.medications
  set cadence = 'diaria'
  where cadence is null
    and reminder_times is not null
    and array_length(reminder_times, 1) > 0;

comment on column public.medications.cadence is
  'diaria | semanal (com cadence_weekday) | intervalo (com cadence_interval_days e cadence_anchor_on). NULO = frequência não declarada: o cálculo de sobreposição não projeta doses de dias anteriores para este item.';
