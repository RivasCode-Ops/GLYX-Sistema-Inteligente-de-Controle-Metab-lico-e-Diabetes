-- Alarme de dose agora carrega medId no payload do push, permitindo o
-- botão "Já tomei" direto na notificação (service worker registra a dose
-- via POST /api/medications/taken sem abrir o app).
-- Corpo completo da função na 14ª migração aplicada no Supabase; mudança:
-- coluna med_id no CTE messages + 'medId' no jsonb do payload (null em refill).
select 1;
