"use client";

import { motion } from "framer-motion";
import { CircleX, Info, LoaderCircle, Search } from "lucide-react";
import type { ReactNode } from "react";
import type { RiskAssessment, RiskLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

export const inputClass =
  "w-full rounded-full border border-white/15 bg-white/[0.04] px-5 py-3 text-sm text-neutral-100 placeholder:text-neutral-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] outline-none backdrop-blur-md transition focus:border-white/40 focus:bg-white/[0.07] focus:ring-4 focus:ring-white/5";

const RISK_STYLES: Record<RiskLevel, { label: string; text: string; bar: string; ring: string }> = {
  none: { label: "Clear", text: "text-white", bar: "bg-white", ring: "border-white/20" },
  low: { label: "Low", text: "text-lime-300", bar: "bg-lime-400", ring: "border-lime-400/30" },
  moderate: { label: "Moderate", text: "text-amber-300", bar: "bg-amber-400", ring: "border-amber-400/30" },
  high: { label: "High", text: "text-orange-300", bar: "bg-orange-400", ring: "border-orange-400/30" },
  critical: { label: "Critical", text: "text-rose-300", bar: "bg-rose-500", ring: "border-rose-500/40" },
};

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="pl-5 font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-500">
        {label}
      </label>
      {children}
      {hint ? <p className="pl-5 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}

export function ScanButton({ loading, disabled, children }: { loading: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="inline-flex h-[46px] shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-950 shadow-[0_0_30px_rgba(255,255,255,0.12)] transition hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-neutral-500 disabled:shadow-none"
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
      {loading ? "Scanning" : children}
    </button>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 backdrop-blur-md">
      <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-neutral-300 backdrop-blur-md">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-white/10 bg-neutral-950/40 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl", className)}>{children}</div>;
}

export function DataRow({ label, value, mono = true }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.06] py-2 last:border-b-0">
      <dt className="shrink-0 text-xs uppercase tracking-wider text-neutral-500">{label}</dt>
      <dd className={cn("min-w-0 break-words text-right text-sm text-neutral-200", mono && "font-mono")}>{value}</dd>
    </div>
  );
}

export function RiskPanel({ risk, title = "Threat score" }: { risk: RiskAssessment; title?: string }) {
  const style = RISK_STYLES[risk.level];
  return (
    <Card className={cn("flex flex-col gap-4", style.ring)}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">{title}</p>
          <p className={cn("mt-1 text-2xl font-semibold", style.text)}>{style.label}</p>
        </div>
        <p className="font-mono text-4xl font-semibold tabular-nums text-neutral-100">
          {risk.score}
          <span className="text-base text-neutral-500">/100</span>
        </p>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={risk.score}
        aria-label={title}
      >
        <motion.div
          className={cn("h-full rounded-full", style.bar)}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(risk.score, 2)}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-400">Findings</p>
          <ul className="space-y-1.5 text-sm text-neutral-300">
            {risk.factors.map((factor) => (
              <li key={factor} className="flex gap-2">
                <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", style.bar)} aria-hidden />
                {factor}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-400">Recommended actions</p>
          <ul className="space-y-1.5 text-sm text-neutral-300">
            {risk.recommendations.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-neutral-500" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
