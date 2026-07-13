-- Auditoria de escalabilidade: consultas frequentes sem indice dedicado.
create index if not exists medications_user_active_idx
  on public.medications (user_id, active);

-- Indice parcial: evaluate_meal_glucose_spikes() roda a cada 30 min
-- filtrando exatamente por glucose_spike is null.
create index if not exists meals_user_pending_spike_idx
  on public.meals (user_id) where glucose_spike is null;
