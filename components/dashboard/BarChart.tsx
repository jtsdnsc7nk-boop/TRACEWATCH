"use client";

import { useMemo, useState } from "react";
import type { DashboardSeriesPoint } from "@/lib/types";
import { cn, formatCompact, formatNumber } from "@/lib/utils";

type Metric = "breaches" | "records";

function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * base) return step * base;
  }
  return 10 * base;
}

/**
 * Single-series vertical bar chart: one measure at a time (toggle), recessive grid, per-bar hover
 * tooltip with an oversized hit area, and a table view for screen readers and exact values.
 */
export function BarChart({
  title,
  points,
  formatLabel = (label) => label,
  tickEvery = 1,
}: {
  title: string;
  points: DashboardSeriesPoint[];
  formatLabel?: (label: string) => string;
  tickEvery?: number;
}) {
  const [metric, setMetric] = useState<Metric>("breaches");
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const max = useMemo(() => niceCeiling(Math.max(...points.map((point) => point[metric]), 0)), [points, metric]);
  const format = metric === "breaches" ? formatNumber : formatCompact;
  const hovered = hover !== null ? points[hover] : null;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-neutral-100">{title}</h2>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 rounded-full border border-white/10 bg-white/[0.03] p-0.5" role="group" aria-label="Measure">
            {(["breaches", "records"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={metric === option}
                onClick={() => setMetric(option)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] transition",
                  metric === option ? "bg-white text-neutral-950" : "text-neutral-400 hover:text-white",
                )}
              >
                {option}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-pressed={showTable}
            onClick={() => setShowTable((value) => !value)}
            className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] text-neutral-400 transition hover:text-white"
          >
            {showTable ? "Chart" : "Table"}
          </button>
        </div>
      </div>

      {showTable ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-neutral-950/90">
              <tr className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                <th className="py-1.5 font-normal">Period</th>
                <th className="py-1.5 text-right font-normal">Breaches</th>
                <th className="py-1.5 text-right font-normal">Records</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.label} className="border-t border-white/[0.06] text-neutral-300">
                  <td className="py-1.5">{formatLabel(point.label)}</td>
                  <td className="py-1.5 text-right font-mono">{formatNumber(point.breaches)}</td>
                  <td className="py-1.5 text-right font-mono">{formatNumber(point.records)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative flex-1">
          <div className="relative flex h-52 gap-3">
            <div className="flex w-10 shrink-0 flex-col justify-between pb-6 text-right font-mono text-[10px] text-neutral-500">
              <span>{format(max)}</span>
              <span>{format(max / 2)}</span>
              <span>0</span>
            </div>
            <div className="relative flex-1">
              <div className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between" aria-hidden>
                <div className="border-t border-dashed border-white/[0.07]" />
                <div className="border-t border-dashed border-white/[0.07]" />
                <div className="border-t border-white/20" />
              </div>
              <div
                className="absolute inset-x-0 top-0 bottom-6 flex items-end gap-[2px]"
                onMouseLeave={() => setHover(null)}
                role="img"
                aria-label={`${title}, ${metric} per period. Use the table view for exact values.`}
              >
                {points.map((point, index) => {
                  const value = point[metric];
                  const height = value > 0 ? Math.max(1.5, (value / max) * 100) : 0;
                  return (
                    <div
                      key={point.label}
                      className="relative flex h-full flex-1 cursor-default items-end"
                      onMouseEnter={() => setHover(index)}
                    >
                      <div
                        className={cn(
                          "w-full rounded-t-[4px] transition-colors duration-150",
                          hover === null ? "bg-white/75" : hover === index ? "bg-white" : "bg-white/25",
                        )}
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="absolute inset-x-0 bottom-0 flex h-5 gap-[2px]" aria-hidden>
                {points.map((point, index) => (
                  <span key={point.label} className="relative flex-1 text-center font-mono text-[10px] text-neutral-500">
                    {index % tickEvery === 0 || index === points.length - 1 ? (
                      <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{formatLabel(point.label)}</span>
                    ) : null}
                  </span>
                ))}
              </div>

              {hovered && hover !== null ? (
                <div
                  className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-white/15 bg-neutral-950/95 px-3 py-2 shadow-xl backdrop-blur-md"
                  style={{ left: `${((hover + 0.5) / points.length) * 100}%` }}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                    {formatLabel(hovered.label)}
                  </p>
                  <p className="mt-1 text-sm whitespace-nowrap text-neutral-100">
                    <span className="font-mono">{formatNumber(hovered.breaches)}</span> breaches
                  </p>
                  <p className="text-sm whitespace-nowrap text-neutral-300">
                    <span className="font-mono">{formatCompact(hovered.records)}</span> records
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
