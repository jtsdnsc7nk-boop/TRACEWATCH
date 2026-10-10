import { ShieldCheck, TriangleAlert } from "lucide-react";
import { type Breach, SOURCE_LABELS } from "@/lib/types";
import { cn, formatCompact, formatDate } from "@/lib/utils";

const HIGH_RISK = /password|credit card|bank|social security|government|passport|auth token|security question/i;

export function BreachCard({ breach }: { breach: Breach }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-neutral-950/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl transition hover:border-white/20">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-neutral-100">{breach.title}</h3>
          <p className="truncate font-mono text-xs text-neutral-500">{breach.domain ?? "no associated domain"}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <span className="font-mono text-xs text-neutral-300">{formatDate(breach.date)}</span>
          {breach.records !== null ? (
            <span className="font-mono text-xs text-neutral-500">{formatCompact(breach.records)} records</span>
          ) : null}
        </div>
      </header>

      {breach.description ? <p className="line-clamp-3 text-sm leading-relaxed text-neutral-400">{breach.description}</p> : null}

      {breach.dataClasses.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Exposed data types">
          {breach.dataClasses.map((dataClass) => (
            <li
              key={dataClass}
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs",
                HIGH_RISK.test(dataClass)
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                  : "border-white/10 bg-white/[0.04] text-neutral-300",
              )}
            >
              {dataClass}
            </li>
          ))}
        </ul>
      ) : null}

      <footer className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
        <span className="inline-flex items-center gap-1">
          {breach.verified ? (
            <ShieldCheck className="size-3.5 text-white" aria-hidden />
          ) : (
            <TriangleAlert className="size-3.5 text-amber-400" aria-hidden />
          )}
          {breach.verified ? "Verified" : "Unverified"}
        </span>
        {breach.sensitive ? <span className="text-rose-300">Sensitive</span> : null}
        <span className="ml-auto flex flex-wrap justify-end gap-1">
          {breach.sources.map((source) => (
            <span
              key={source}
              className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-neutral-400"
            >
              {SOURCE_LABELS[source]}
            </span>
          ))}
        </span>
      </footer>
    </article>
  );
}
