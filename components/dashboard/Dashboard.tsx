"use client";

import { motion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  AtSign,
  CircleCheck,
  CircleX,
  Hash,
  KeyRound,
  LoaderCircle,
  Lock,
  Phone,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { DashboardResult, RiskLevel, StatusResult } from "@/lib/types";
import { requestJson } from "@/lib/client";
import { type ScanKind, useSessionLog } from "@/lib/session";
import { cn, formatCompact, formatDate, formatNumber } from "@/lib/utils";
import { Backdrop } from "@/components/Backdrop";
import { BarChart } from "@/components/dashboard/BarChart";
import { Logo } from "@/components/Logo";
import { ErrorBanner } from "@/components/ui";

const KIND_META: Record<ScanKind, { label: string; icon: typeof AtSign; tab: string }> = {
  email: { label: "Email", icon: AtSign, tab: "email" },
  password: { label: "Password", icon: KeyRound, tab: "password" },
  phone: { label: "Phone", icon: Phone, tab: "phone" },
  discord: { label: "Discord", icon: Hash, tab: "discord" },
};

const LEVEL_STYLE: Record<RiskLevel, { label: string; text: string; dot: string }> = {
  none: { label: "Clear", text: "text-neutral-200", dot: "bg-white" },
  low: { label: "Low", text: "text-lime-300", dot: "bg-lime-400" },
  moderate: { label: "Moderate", text: "text-amber-300", dot: "bg-amber-400" },
  high: { label: "High", text: "text-orange-300", dot: "bg-orange-400" },
  critical: { label: "Critical", text: "text-rose-300", dot: "bg-rose-500" },
};

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}

function shortYear(key: string): string {
  return `'${key.slice(2)}`;
}

function timeAgo(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export function Dashboard() {
  const [data, setData] = useState<DashboardResult | null>(null);
  const [status, setStatus] = useState<StatusResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const session = useSessionLog();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [dashboard, health] = await Promise.allSettled([
      requestJson<DashboardResult>("/api/dashboard"),
      requestJson<StatusResult>("/api/status"),
    ]);
    if (dashboard.status === "fulfilled") setData(dashboard.value);
    else setError(dashboard.reason instanceof Error ? dashboard.reason.message : "Could not load dashboard data.");
    if (health.status === "fulfilled") setStatus(health.value);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const operational = status?.sources.filter((source) => source.ok).length ?? 0;
  const sessionAverage =
    session.scans.length > 0 ? Math.round(session.scans.reduce((sum, scan) => sum + scan.score, 0) / session.scans.length) : null;

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <Backdrop />

      <header className="relative z-20 flex items-center justify-between gap-4 px-5 pt-7 sm:px-9 sm:pt-9">
        <Link href="/" className="flex items-center gap-2.5 text-white" aria-label="TraceWatch home">
          <Logo className="size-8" />
          <span className="text-xs font-medium tracking-[0.3em]">TRACEWATCH</span>
          <span className="hidden font-mono text-[10px] tracking-[0.25em] text-neutral-500 sm:inline">/ DASHBOARD</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-300 backdrop-blur-md sm:inline-flex">
            <Lock className="size-3" aria-hidden />
            Zero persistence
          </span>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-950 transition hover:bg-neutral-200"
          >
            Scanner
            <ArrowUpRight className="size-3" aria-hidden />
          </Link>
        </div>
      </header>

      <motion.main
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-10 sm:px-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-400">
              <span className="tw-pulse size-1.5 rounded-full bg-white" aria-hidden />
              Live threat intelligence
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">Exposure dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-400">
              Global breach activity, source health and the scans you ran in this tab. No account needed, and nothing here
              is stored: your session activity clears when you close or reload the page.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 self-start rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-neutral-300 backdrop-blur-md transition hover:border-white/35 hover:text-white disabled:opacity-60 sm:self-auto"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden />
            {data ? `Updated ${new Date(data.generatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}` : "Refresh"}
          </button>
        </div>

        {error ? <ErrorBanner message={error} /> : null}

        {!data && loading ? (
          <p className="flex items-center gap-2 py-20 text-sm text-neutral-400">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading intelligence
          </p>
        ) : null}

        {data ? (
          <>
            <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Breaches catalogued" value={formatNumber(data.totals.breaches)} detail={`${formatNumber(data.totals.verified)} verified`} />
              <Kpi label="Records exposed" value={formatCompact(data.totals.records)} detail={`${formatNumber(data.totals.dataTypes)} distinct data types`} />
              <Kpi label="Added last 30 days" value={formatNumber(data.totals.addedLast30Days)} detail={`${formatNumber(data.totals.addedLast12Months)} in the last 12 months`} />
              <Kpi
                label="Records added, 12 months"
                value={formatCompact(data.totals.recordsAddedLast12Months)}
                detail={`${formatNumber(data.totals.sensitive)} sensitive breaches overall`}
              />
            </section>

            <section className="grid gap-5 lg:grid-cols-3">
              <Panel className="lg:col-span-2">
                <BarChart title="Breaches added per month" points={data.addedByMonth} formatLabel={monthLabel} />
              </Panel>
              <Panel>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-neutral-100">Source health</h2>
                  {status ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                      {operational}/{status.sources.length} up
                    </span>
                  ) : null}
                </div>
                {status ? (
                  <ul className="mt-4 flex flex-col">
                    {status.sources.map((source) => (
                      <li key={source.id} className="flex items-center gap-3 border-t border-white/[0.06] py-2.5 first:border-t-0">
                        {source.ok ? (
                          <CircleCheck className="size-4 shrink-0 text-white" aria-hidden />
                        ) : (
                          <CircleX className="size-4 shrink-0 text-rose-300" aria-hidden />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-neutral-200">{source.label}</p>
                          <p className="truncate text-xs text-neutral-500">{source.purpose}</p>
                        </div>
                        <div className="text-right">
                          <p className={cn("text-xs", source.ok ? "text-neutral-300" : "text-rose-300")}>{source.detail}</p>
                          <p className="font-mono text-[10px] text-neutral-500">
                            {source.latencyMs !== null ? `${formatNumber(source.latencyMs)} ms` : "n/a"}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-sm text-neutral-500">Source status unavailable.</p>
                )}
              </Panel>
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
              <Panel>
                <BarChart title="Breaches by year of incident" points={data.byIncidentYear} formatLabel={shortYear} tickEvery={2} />
              </Panel>
              <Panel>
                <h2 className="text-sm font-medium text-neutral-100">Most exposed data types</h2>
                <p className="mt-1 text-xs text-neutral-500">Share of all catalogued breaches containing each type</p>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {data.topDataTypes.map((type) => (
                    <li key={type.name} className="grid grid-cols-[minmax(0,9rem)_1fr_3.5rem] items-center gap-3 text-sm">
                      <span className="truncate text-neutral-300" title={type.name}>
                        {type.name}
                      </span>
                      <span className="h-2 overflow-hidden rounded-full bg-white/[0.06]" title={`${formatNumber(type.breaches)} breaches`}>
                        <motion.span
                          className="block h-full rounded-r-[4px] bg-white/80"
                          initial={{ width: 0 }}
                          animate={{ width: `${type.share * 100}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                        />
                      </span>
                      <span className="text-right font-mono text-xs text-neutral-400">{Math.round(type.share * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
              <Panel>
                <h2 className="text-sm font-medium text-neutral-100">Largest breaches</h2>
                <BreachTable breaches={data.largest} column="records" />
              </Panel>
              <Panel>
                <h2 className="text-sm font-medium text-neutral-100">Recently added</h2>
                <BreachTable breaches={data.recent} column="added" />
              </Panel>
            </section>
          </>
        ) : null}

        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-neutral-400" aria-hidden />
              <h2 className="text-sm font-medium text-neutral-100">Your session activity</h2>
            </div>
            <div className="flex items-center gap-4">
              {sessionAverage !== null ? (
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                  {session.scans.length} scans · avg risk {sessionAverage}
                </span>
              ) : null}
              {session.scans.length > 0 ? (
                <button
                  type="button"
                  onClick={session.clear}
                  className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-neutral-400 transition hover:text-white"
                >
                  <Trash2 className="size-3" aria-hidden />
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          {session.scans.length === 0 ? (
            <div className="mt-5 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-neutral-500">
                No scans yet in this tab. Results appear here as you run them, masked, and vanish on reload.
              </p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(KIND_META) as ScanKind[]).map((kind) => {
                  const meta = KIND_META[kind];
                  const Icon = meta.icon;
                  return (
                    <Link
                      key={kind}
                      href={`/#${meta.tab}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.03] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-neutral-300 transition hover:border-white/35 hover:text-white"
                    >
                      <Icon className="size-3" aria-hidden />
                      {meta.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                    <th className="pb-2 font-normal">Scanner</th>
                    <th className="pb-2 font-normal">Target</th>
                    <th className="pb-2 font-normal">Result</th>
                    <th className="pb-2 font-normal">Risk</th>
                    <th className="pb-2 text-right font-normal">When</th>
                  </tr>
                </thead>
                <tbody>
                  {session.scans.map((scan) => {
                    const meta = KIND_META[scan.kind];
                    const Icon = meta.icon;
                    const level = LEVEL_STYLE[scan.level];
                    return (
                      <tr key={scan.id} className="border-t border-white/[0.06] text-neutral-300">
                        <td className="py-2.5">
                          <span className="inline-flex items-center gap-2">
                            <Icon className="size-3.5 text-neutral-500" aria-hidden />
                            {meta.label}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-xs">{scan.target}</td>
                        <td className="py-2.5 text-neutral-400">{scan.summary}</td>
                        <td className="py-2.5">
                          <span className={cn("inline-flex items-center gap-1.5", level.text)}>
                            <span className={cn("size-1.5 rounded-full", level.dot)} aria-hidden />
                            {level.label}
                            <span className="font-mono text-xs text-neutral-500">{scan.score}</span>
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-mono text-xs text-neutral-500">{timeAgo(scan.at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <footer className="pt-4 text-center font-mono text-[10px] uppercase leading-relaxed tracking-[0.2em] text-neutral-600">
          Catalogue data: Have I Been Pwned · Source probes cached for 2 minutes · Session data never leaves this tab
        </footer>
      </motion.main>
    </div>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-neutral-950/55 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Panel className="p-4 sm:p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-white sm:text-3xl">{value}</p>
      <p className="mt-1 truncate text-xs text-neutral-500">{detail}</p>
    </Panel>
  );
}

function BreachTable({
  breaches,
  column,
}: {
  breaches: DashboardResult["largest"];
  column: "records" | "added";
}) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[380px] text-left text-sm">
        <thead>
          <tr className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
            <th className="pb-2 font-normal">Breach</th>
            <th className="pb-2 font-normal">Incident</th>
            <th className="pb-2 text-right font-normal">{column === "records" ? "Records" : "Added"}</th>
          </tr>
        </thead>
        <tbody>
          {breaches.map((breach) => (
            <tr key={breach.name} className="border-t border-white/[0.06]">
              <td className="max-w-0 py-2.5 pr-3">
                <p className="truncate text-neutral-200" title={breach.title}>
                  {breach.title}
                </p>
                <p className="truncate font-mono text-[11px] text-neutral-500">{breach.domain ?? "no domain"}</p>
              </td>
              <td className="py-2.5 font-mono text-xs whitespace-nowrap text-neutral-400">{formatDate(breach.date)}</td>
              <td className="py-2.5 text-right font-mono text-xs whitespace-nowrap text-neutral-300">
                {column === "records" ? formatCompact(breach.records ?? 0) : formatDate(breach.addedDate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
