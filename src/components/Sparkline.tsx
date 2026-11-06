// Lightweight inline-SVG equity curves — no chart dependency.
// Points are plotted by index (snapshot days are evenly spaced in
// practice); each series is normalised to its own min/max.

export type CurvePoint = { date: Date | string; value: number };

function pointsAttr(points: CurvePoint[], w: number, h: number, pad = 2): string {
  if (points.length === 0) return "";
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  return points
    .map((p, i) => {
      const x = points.length > 1 ? pad + i * stepX : w / 2;
      const y = h - pad - ((p.value - min) / span) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Tiny trend line for league rows and portfolio cards. */
export function Sparkline({
  points,
  width = 96,
  height = 28,
  stroke = "#00D09C",
}: {
  points: CurvePoint[];
  width?: number;
  height?: number;
  stroke?: string;
}) {
  if (points.length === 0) return <span className="text-muted text-xs">—</span>;
  if (points.length === 1) {
    return (
      <svg width={width} height={height} aria-hidden>
        <circle cx={width / 2} cy={height / 2} r="3" fill={stroke} />
      </svg>
    );
  }
  return (
    <svg width={width} height={height} aria-hidden>
      <polyline
        points={pointsAttr(points, width, height)}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export type CurveSeries = { name: string; color: string; points: CurvePoint[] };

/** Larger multi-series equity curve for portfolio detail + compare. */
export function EquityChart({
  series,
  height = 140,
}: {
  series: CurveSeries[];
  height?: number;
}) {
  const W = 720;
  const visible = series.filter((s) => s.points.length > 0);
  if (visible.length === 0) {
    return <p className="text-sm text-muted">No snapshots yet — the curve starts with the first price update.</p>;
  }
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="Equity curve">
        {visible.map((s) =>
          s.points.length === 1 ? (
            <circle
              key={s.name}
              cx={W / 2}
              cy={height / 2}
              r="4"
              fill={s.color}
            />
          ) : (
            <polyline
              key={s.name}
              points={pointsAttr(s.points, W, height, 6)}
              fill="none"
              stroke={s.color}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )
        )}
      </svg>
      <div className="flex flex-wrap gap-4 mt-2 text-xs">
        {visible.map((s) => {
          const first = s.points[0];
          const last = s.points[s.points.length - 1];
          return (
            <span key={s.name} className="inline-flex items-center gap-2">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ background: s.color }}
              />
              <span className="font-semibold">{s.name}</span>
              <span className="text-muted">
                {s.points.length} day{s.points.length === 1 ? "" : "s"} · latest{" "}
                {typeof last.date === "string"
                  ? last.date
                  : last.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
