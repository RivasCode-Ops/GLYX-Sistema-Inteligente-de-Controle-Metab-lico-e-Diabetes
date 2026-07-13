type Props = {
  values: number[];
  className?: string;
  stroke?: string;
};

/** Linha de tendência minimalista a partir de uma série de números. */
export function Sparkline({ values, className, stroke = "currentColor" }: Props) {
  if (values.length < 2) return null;

  const width = 300;
  const height = 40;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label="Tendência das últimas leituras de glicemia"
    >
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={2} />
    </svg>
  );
}
