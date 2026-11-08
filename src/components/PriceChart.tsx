"use client";

// Stock close-price chart — inline SVG, no chart dependency.
// Range tabs slice the tail of the series (points are trading days).
// Entry overlays draw dashed lines at league portfolios' entry prices.

import { useMemo, useState } from "react";

export type PricePoint = { date: string; close: number };
export type EntryLine = { label: string; price: number; color: string };

const RANGES = [
  { label: "1M", days: 21 },
  { label: "3M", days: 63 },
  { label: "6M", days: 126 },
  { label: "1Y", days: 250 },
  { label: "ALL", days: Infinity },
] as const;

const inr = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PriceChart({
  points,
  entries = [],
  height = 220,
}: {
  points: PricePoint[];
  entries?: EntryLine[];
  height?: number;
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]["label"]>("3M");
  const shown = useMemo(() => {
    const r = RANGES.find((x) => x.label === range) ?? RANGES[1];
    return r.days === Infinity ? points : points.slice(-r.days);
  }, [points, range]);

  if (points.length === 0) {
    return <p className="text-sm text-muted">No price history yet — the chart fills in as the nightly closes land.</p>;
  }

  const W = 720;
  const pad = 6;
  const closes = shown.map((p) => p.close);
  let min = Math.min(...closes);
  let max = Math.max(...closes);
  for (const e of entries) {
    if (e.price >= min * 0.9 && e.price <= max * 1.1) {
      min = Math.min(min, e.price);
      max = Math.max(max, e.price);
    }
  }
  const span = max - min || 1;
  min -= span * 0.05;
  max += span * 0.05;
  const y = (v: number) => height - pad - ((v - min) / (max - min)) * (height - pad * 2);
  const stepX = shown.length > 1 ? (W - pad * 2) / (shown.length - 1) : 0;
  const line = shown
    .map((p, i) => `${(pad + i * stepX).toFixed(1)},${y(p.close).toFixed(1)}`)
    .join(" ");
  const first = shown[0];
  const last = shown[shown.length - 1];
  const change = first && last && first.close > 0 ? ((last.close - first.close) / first.close) * 100 : 0;
  const up = change >= 0;
  const stroke = up ? "#00D09C" : "#FF6B5E";
  const area = `${pad},${height - pad} ${line} ${(pad + (shown.length - 1) * stepX).toFixed(1)},${height - pad}`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {RANGES.map((r) => (
          <button
            key={r.label}
            onClick={() => setRange(r.label)}
            className={`rounded-full px-3 py-1 text-xs font-semibold border ${
              range === r.label
                ? "border-groww text-groww bg-groww-dim"
                : "border-edge text-muted hover:text-cream"
            }`}
          >
            {r.label}
          </button>
        ))}
        <span className={`ml-auto text-sm font-semibold ${up ? "text-groww" : "text-loss"}`}>
          {up ? "+" : ""}
          {change.toFixed(2)}% in range
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="Price chart">
        <polygon points={area} fill={stroke} opacity="0.08" />
        <polyline
          points={line}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {entries.map((e) =>
          e.price >= min && e.price <= max ? (
            <g key={e.label}>
              <line
                x1={pad}
                x2={W - pad}
                y1={y(e.price)}
                y2={y(e.price)}
                stroke={e.color}
                strokeWidth="1.5"
                strokeDasharray="6 4"
                opacity="0.85"
              />
              <text x={W - pad} y={y(e.price) - 4} textAnchor="end" fontSize="11" fill={e.color}>
                {e.label} @ {inr(e.price)}
              </text>
            </g>
          ) : null
        )}
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-muted">
        <span>
          {first?.date} → {last?.date} · {shown.length} trading days
        </span>
        <span>High {inr(Math.max(...closes))}</span>
        <span>Low {inr(Math.min(...closes))}</span>
        <span>Last {last ? inr(last.close) : "—"}</span>
      </div>
    </div>
  );
}
