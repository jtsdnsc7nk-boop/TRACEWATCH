"use client";

import { CircleCheck, CircleHelp, CircleMinus, ExternalLink } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import type { UsernameCategory, UsernameScanResult, UsernameSiteResult } from "@/lib/types";
import { requestJson, useScan } from "@/lib/client";
import { useSessionLog } from "@/lib/session";
import { cn, formatNumber } from "@/lib/utils";
import { Card, ErrorBanner, Field, inputClass, Notice, Reveal, ScanButton } from "@/components/ui";

type Filter = "found" | "all" | "not_found" | "unknown";

const CATEGORY_LABELS: Record<UsernameCategory, string> = {
  social: "Social",
  developer: "Developer",
  gaming: "Gaming",
  creative: "Creative",
  community: "Community",
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: "found", label: "Found" },
  { id: "all", label: "All" },
  { id: "not_found", label: "Not found" },
  { id: "unknown", label: "Unknown" },
];

export function UsernamePanel() {
  const [username, setUsername] = useState("");
  const [filter, setFilter] = useState<Filter>("found");
  const scan = useScan<UsernameScanResult>();
  const session = useSessionLog();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilter("found");
    void scan.run(async () => {
      const result = await requestJson<UsernameScanResult>("/api/scan/username", { username });
      session.record({
        kind: "username",
        target: `@${result.username.slice(0, 2)}${"*".repeat(Math.max(2, result.username.length - 2))}`,
        score: 0,
        level: "none",
        summary: `Found on ${result.found} of ${result.checked} sites`,
      });
      return result;
    });
  }

  const result = scan.data;
  const counts = useMemo(() => {
    const tally = { found: 0, not_found: 0, unknown: 0, all: 0 };
    for (const item of result?.results ?? []) {
      if (item.status === "invalid") continue;
      tally[item.status] += 1;
      tally.all += 1;
    }
    return tally;
  }, [result]);

  const grouped = useMemo(() => {
    const groups = new Map<UsernameCategory, UsernameSiteResult[]>();
    for (const item of result?.results ?? []) {
      if (item.status === "invalid") continue;
      if (filter !== "all" && item.status !== filter) continue;
      const list = groups.get(item.category) ?? [];
      list.push(item);
      groups.set(item.category, list);
    }
    return Array.from(groups.entries());
  }, [result, filter]);

  const invalid = result?.results.filter((item) => item.status === "invalid") ?? [];

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Username" htmlFor="username-input">
            <input
              id="username-input"
              type="text"
              required
              maxLength={41}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
              placeholder="torvalds"
              value={username}
              onChange={(event) => setUsername(event.target.value.replace(/\s/g, ""))}
              className={inputClass}
            />
          </Field>
        </div>
        <ScanButton loading={scan.loading} disabled={username.replace(/^@/, "").length < 2}>
          Search sites
        </ScanButton>
      </form>

      {scan.loading ? (
        <p className="pl-5 font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          Checking every supported site in parallel, usually under 10 seconds
        </p>
      ) : null}

      {scan.error ? <ErrorBanner message={scan.error} /> : null}

      {result ? (
        <Reveal className="flex flex-col gap-5">
          <Card className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-500">
                Footprint for @{result.username}
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">
                <span className="font-mono">{formatNumber(result.found)}</span>
                <span className="text-base font-normal text-neutral-400"> of {formatNumber(result.checked)} sites</span>
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Checked in {(result.durationMs / 1000).toFixed(1)}s · {counts.unknown} could not be verified
              </p>
            </div>
            <div className="flex gap-1 self-start rounded-full border border-white/10 bg-white/[0.03] p-1 sm:self-auto" role="group" aria-label="Filter results">
              {FILTERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={filter === option.id}
                  onClick={() => setFilter(option.id)}
                  className={cn(
                    "whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] transition",
                    filter === option.id ? "bg-white text-neutral-950" : "text-neutral-400 hover:text-white",
                  )}
                >
                  {option.label} <span className="font-mono opacity-70">{counts[option.id]}</span>
                </button>
              ))}
            </div>
          </Card>

          <Notice>
            A matching username is not proof that the accounts belong to the same person. Open each profile and compare
            details before drawing conclusions.
          </Notice>

          {grouped.length === 0 ? (
            <p className="text-sm text-neutral-500">No sites in this view.</p>
          ) : (
            grouped.map(([category, items]) => (
              <section key={category} aria-label={CATEGORY_LABELS[category]} className="flex flex-col gap-2">
                <h3 className="pl-1 font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-500">
                  {CATEGORY_LABELS[category]}
                </h3>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((item) => (
                    <SiteRow key={item.id} item={item} />
                  ))}
                </ul>
              </section>
            ))
          )}

          {invalid.length > 0 ? (
            <p className="text-xs text-neutral-500">
              Skipped {invalid.length} site{invalid.length === 1 ? "" : "s"} where this username format is not allowed:{" "}
              {invalid.map((item) => item.name).join(", ")}.
            </p>
          ) : null}
        </Reveal>
      ) : null}
    </div>
  );
}

function SiteRow({ item }: { item: UsernameSiteResult }) {
  const Icon = item.status === "found" ? CircleCheck : item.status === "unknown" ? CircleHelp : CircleMinus;
  const content = (
    <>
      <Icon
        className={cn(
          "size-4 shrink-0",
          item.status === "found" ? "text-white" : item.status === "unknown" ? "text-amber-300" : "text-neutral-600",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm", item.status === "found" ? "text-neutral-100" : "text-neutral-400")}>{item.name}</p>
        <p className="truncate font-mono text-[11px] text-neutral-500">
          {item.status === "found"
            ? item.profileUrl.replace(/^https:\/\/(www\.)?/, "")
            : item.status === "unknown"
              ? (item.detail ?? "Could not verify")
              : "Not found"}
        </p>
      </div>
      {item.status === "found" ? <ExternalLink className="size-3.5 shrink-0 text-neutral-500" aria-hidden /> : null}
    </>
  );

  const className =
    "flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 backdrop-blur-md transition";

  return (
    <li>
      {item.status === "found" ? (
        <a
          href={item.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(className, "hover:border-white/30 hover:bg-white/[0.06]")}
        >
          {content}
        </a>
      ) : (
        <div className={className}>{content}</div>
      )}
    </li>
  );
}
