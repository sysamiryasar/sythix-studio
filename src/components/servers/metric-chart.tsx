"use client";

import { useMemo, useRef, useState } from "react";
import { Table2 } from "lucide-react";

export interface Point {
  t: number;
  v: number | null;
}

/**
 * Single-series line chart: one measure, one axis. 2px line in the accent
 * colour, recessive grid, crosshair tooltip, and a table view for screen readers.
 * Gaps (null values / missing minutes) break the line instead of interpolating.
 */
export function MetricChart({ title, points, unit = "", min, max, format = (v) => v.toFixed(1) }: { title: string; points: Point[]; unit?: string; min?: number; max?: number; format?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const ref = useRef<SVGSVGElement>(null);
  const W = 600;
  const H = 160;
  const PAD = { l: 40, r: 8, t: 8, b: 20 };
  const values = points.map((p) => p.v).filter((v): v is number => v != null);
  const lo = min ?? (values.length ? Math.min(...values) : 0);
  const hi = max ?? (values.length ? Math.max(...values) : 1);
  const span = hi - lo || 1;
  const t0 = points[0]?.t ?? 0;
  const t1 = points.at(-1)?.t ?? 1;
  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / span) * (H - PAD.t - PAD.b);

  const path = useMemo(() => {
    let d = "";
    let prevT = 0;
    for (const p of points) {
      if (p.v == null) {
        prevT = 0;
        continue;
      }
      const gap = prevT && p.t - prevT > 120_000; // missing minutes = disconnected
      d += `${d && !gap ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
      prevT = p.t;
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, lo, hi]);

  const last = [...points].reverse().find((p) => p.v != null);
  const h = hover != null ? points[hover] : null;
  const ticks = [lo, lo + span / 2, hi];

  return (
    <figure className="rounded-lg border border-border bg-surface p-3">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted">{title}</span>
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-fg">{last?.v != null ? `${format(last.v)}${unit}` : "—"}</span>
          <button className="rounded p-0.5 text-faint hover:text-fg" aria-pressed={table} aria-label={`Show ${title} as a table`} onClick={() => setTable((v) => !v)}>
            <Table2 className="h-3.5 w-3.5" />
          </button>
        </span>
      </figcaption>
      {values.length === 0 ? (
        <div className="flex h-[120px] items-center justify-center text-xs text-faint">No data reported for this range.</div>
      ) : table ? (
        <div className="sx-scroll max-h-[160px] overflow-y-auto text-xs">
          <table className="w-full">
            <thead className="text-faint">
              <tr><th className="text-left font-normal">Time (UTC)</th><th className="text-right font-normal">{title}</th></tr>
            </thead>
            <tbody className="tabular-nums text-muted">
              {points.filter((p) => p.v != null).slice(-60).reverse().map((p) => (
                <tr key={p.t}><td>{new Date(p.t).toISOString().slice(11, 16)}</td><td className="text-right">{format(p.v!)}{unit}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg
            ref={ref}
            viewBox={`0 0 ${W} ${H}`}
            className="h-[140px] w-full"
            role="img"
            aria-label={`${title} over time; latest ${last?.v != null ? format(last.v) + unit : "unknown"}`}
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              const r = ref.current!.getBoundingClientRect();
              const px = ((e.clientX - r.left) / r.width) * W;
              let best = 0;
              let bestD = Infinity;
              points.forEach((p, i) => {
                const d = Math.abs(x(p.t) - px);
                if (d < bestD && p.v != null) {
                  bestD = d;
                  best = i;
                }
              });
              setHover(best);
            }}
          >
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--sx-border)" strokeWidth={1} />
                <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--sx-faint)">
                  {format(t)}
                </text>
              </g>
            ))}
            <text x={PAD.l} y={H - 4} fontSize={10} fill="var(--sx-faint)">{new Date(t0).toISOString().slice(11, 16)}</text>
            <text x={W - PAD.r} y={H - 4} fontSize={10} textAnchor="end" fill="var(--sx-faint)">{new Date(t1).toISOString().slice(11, 16)} UTC</text>
            <path d={path} fill="none" stroke="var(--sx-chart)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {h?.v != null && (
              <g>
                <line x1={x(h.t)} x2={x(h.t)} y1={PAD.t} y2={H - PAD.b} stroke="var(--sx-border-strong)" strokeWidth={1} />
                <circle cx={x(h.t)} cy={y(h.v)} r={4} fill="var(--sx-chart)" stroke="var(--sx-surface)" strokeWidth={2} />
              </g>
            )}
          </svg>
          {h?.v != null && (
            <div
              className="pointer-events-none absolute top-0 rounded border border-border-strong bg-surface-2 px-2 py-1 text-[11px] shadow-lg"
              style={{ left: `${Math.min(80, (x(h.t) / W) * 100)}%` }}
            >
              <div className="text-faint">{new Date(h.t).toISOString().slice(11, 16)} UTC</div>
              <div className="tabular-nums text-fg">{format(h.v)}{unit}</div>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
