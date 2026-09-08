/**
 * Anel de progresso do dia — consumido contra a meta calórica.
 *
 * A meta vem de `dailyTargets`, calculada do perfil (sexo, idade, altura, peso,
 * atividade e objetivo). Não é número escolhido pelo app nem digitado à toa: se
 * o perfil não tiver os dados, não há meta e o anel não aparece.
 *
 * Passar de 100% NÃO vira vermelho de erro. Comer acima da estimativa não é
 * falha — a estimativa é que tem margem, ainda mais num app onde o macro vem de
 * foto. O anel satura e o número segue legível.
 */
export function DayProgressRing({
  consumed,
  target,
  size = 72,
}: {
  consumed: number;
  target: number;
  size?: number;
}) {
  const pct = target > 0 ? consumed / target : 0;
  const preenchido = Math.max(0, Math.min(1, pct));
  const raio = (size - 8) / 2;
  const circunferencia = 2 * Math.PI * raio;
  const acima = pct > 1;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={raio}
          fill="none"
          stroke="#27272a"
          strokeWidth={7}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={raio}
          fill="none"
          stroke={acima ? "#fbbf24" : "#34d399"}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={circunferencia}
          strokeDashoffset={circunferencia * (1 - preenchido)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-sm text-zinc-100">
        {Math.round(pct * 100)}%
      </span>
    </div>
  );
}
