"use client";

import { Bug, CircleCheck, CircleMinus, CircleX } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import type { EmailScanResult, SourceStatus } from "@/lib/types";
import { requestJson, useScan } from "@/lib/client";
import { maskEmail, useSessionLog } from "@/lib/session";
import { cn, formatDate, formatNumber } from "@/lib/utils";
import { BreachCard } from "@/components/BreachCard";
import { Card, ErrorBanner, Field, inputClass, Notice, Reveal, RiskPanel, ScanButton } from "@/components/ui";

const PAGE_SIZE = 12;
const HIGH_RISK = /password|credit card|bank|social security|government|passport|auth token|security question/i;

export function EmailPanel() {
  const [email, setEmail] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [filter, setFilter] = useState("");
  const scan = useScan<EmailScanResult>();
  const session = useSessionLog();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVisible(PAGE_SIZE);
    setFilter("");
    void scan.run(async () => {
      const result = await requestJson<EmailScanResult>("/api/scan/email", { email });
      session.record({
        kind: "email",
        target: maskEmail(result.email),
        score: result.risk.score,
        level: result.risk.level,
        summary: `${result.breaches.length} breaches · ${result.infostealers.length} infostealer hits`,
      });
      return result;
    });
  }

  const result = scan.data;
  const filtered = useMemo(() => {
    if (!result) return [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return result.breaches;
    return result.breaches.filter(
      (breach) =>
        breach.title.toLowerCase().includes(needle) ||
        (breach.domain ?? "").toLowerCase().includes(needle) ||
        breach.dataClasses.some((dataClass) => dataClass.toLowerCase().includes(needle)),
    );
  }, [result, filter]);

  const totalRecords = result?.breaches.reduce((sum, breach) => sum + (breach.records ?? 0), 0) ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Email address" htmlFor="email-input">
            <input
              id="email-input"
              type="email"
              required
              maxLength={254}
              autoComplete="off"
              spellCheck={false}
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <ScanButton loading={scan.loading} disabled={!email.trim()}>
          Check exposure
        </ScanButton>
      </form>

      {scan.loading ? (
        <p className="pl-5 font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          Querying breach and infostealer sources in parallel
        </p>
      ) : null}

      {scan.error ? <ErrorBanner message={scan.error} /> : null}

      {result ? (
        <Reveal className="flex flex-col gap-5">
          <SourceStrip sources={result.sources} />
          {result.notices.map((notice) => (
            <Notice key={notice}>{notice}</Notice>
          ))}
          <RiskPanel risk={result.risk} title={`Exposure score for ${result.email}`} />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Breaches" value={formatNumber(result.breaches.length)} />
            <Stat label="Infostealer hits" value={formatNumber(result.infostealers.length)} />
            <Stat label="Data types" value={formatNumber(result.exposedFields.length)} />
            <Stat label="Records in set" value={totalRecords > 0 ? formatNumber(totalRecords) : "0"} />
          </div>

          {result.infostealers.length > 0 ? (
            <Card className="flex flex-col gap-4 border-rose-400/25">
              <div className="flex items-start gap-3">
                <Bug className="mt-0.5 size-5 shrink-0 text-rose-300" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-neutral-100">Infostealer malware exposure</p>
                  <p className="mt-1 text-sm text-neutral-400">
                    This address appears in logs from devices infected with password-stealing malware. Everything saved in
                    those browsers (passwords, cookies, autofill) should be treated as compromised.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                      <th className="pb-2 font-normal">Compromised</th>
                      <th className="pb-2 font-normal">System</th>
                      <th className="pb-2 text-right font-normal">Services captured</th>
                      <th className="pb-2 text-right font-normal">Antivirus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.infostealers.map((hit, index) => (
                      <tr key={`${hit.dateCompromised}-${index}`} className="border-t border-white/[0.06] text-neutral-300">
                        <td className="py-2 font-mono">{formatDate(hit.dateCompromised)}</td>
                        <td className="py-2">{hit.operatingSystem ?? "Unknown"}</td>
                        <td className="py-2 text-right font-mono">
                          {formatNumber(hit.userServices + hit.corporateServices)}
                          {hit.corporateServices > 0 ? (
                            <span className="text-neutral-500"> ({formatNumber(hit.corporateServices)} corporate)</span>
                          ) : null}
                        </td>
                        <td className="py-2 text-right">{hit.antivirusCount > 0 ? "Present" : "None detected"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          {result.exposedFields.length > 0 ? (
            <Card className="flex flex-col gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-500">Exposed data types</p>
              <ul className="flex flex-wrap gap-1.5">
                {result.exposedFields.map((field) => (
                  <li key={field}>
                    <button
                      type="button"
                      onClick={() => {
                        setFilter(field);
                        setVisible(PAGE_SIZE);
                      }}
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-xs transition hover:border-white/30",
                        HIGH_RISK.test(field)
                          ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                          : "border-white/10 bg-white/[0.04] text-neutral-300",
                      )}
                    >
                      {field}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {result.breaches.length > 0 ? (
            <section aria-label="Breaches" className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-neutral-400">
                  Showing <span className="font-mono text-neutral-100">{formatNumber(Math.min(visible, filtered.length))}</span>{" "}
                  of <span className="font-mono text-neutral-100">{formatNumber(filtered.length)}</span>
                  {filter ? " matching" : ""} breaches
                </p>
                <input
                  type="search"
                  autoComplete="off"
                  aria-label="Filter breaches"
                  placeholder="Filter by site or data type"
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value);
                    setVisible(PAGE_SIZE);
                  }}
                  className={cn(inputClass, "py-2 sm:max-w-xs")}
                />
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {filtered.slice(0, visible).map((breach) => (
                  <BreachCard key={breach.name} breach={breach} />
                ))}
              </div>
              {visible < filtered.length ? (
                <button
                  type="button"
                  onClick={() => setVisible((count) => count + PAGE_SIZE)}
                  className="self-center rounded-full border border-white/15 bg-white/[0.03] px-5 py-2 text-xs uppercase tracking-[0.18em] text-neutral-300 backdrop-blur-md transition hover:border-neutral-500 hover:text-neutral-100"
                >
                  Show more ({formatNumber(filtered.length - visible)} remaining)
                </button>
              ) : null}
            </section>
          ) : null}
        </Reveal>
      ) : null}
    </div>
  );
}

function SourceStrip({ sources }: { sources: SourceStatus[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Intelligence sources">
      {sources.map((source) => {
        const Icon = source.status === "ok" ? CircleCheck : source.status === "error" ? CircleX : CircleMinus;
        return (
          <li
            key={source.id}
            title={source.message}
            className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 backdrop-blur-md"
          >
            <Icon
              className={cn(
                "size-4 shrink-0",
                source.status === "ok" ? "text-white" : source.status === "error" ? "text-rose-300" : "text-neutral-600",
              )}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="truncate text-xs text-neutral-200">{source.label}</p>
              <p className="truncate font-mono text-[10px] uppercase tracking-wider text-neutral-500">
                {source.status === "ok"
                  ? `${formatNumber(source.found)} found`
                  : source.status === "skipped"
                    ? "Not configured"
                    : (source.message ?? "Unavailable")}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wider text-neutral-500">{label}</p>
      <p className="mt-1 truncate font-mono text-xl font-semibold tabular-nums text-neutral-100">{value}</p>
    </Card>
  );
}
