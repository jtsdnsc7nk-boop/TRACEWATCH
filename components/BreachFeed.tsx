"use client";

import { LoaderCircle, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Breach, CatalogueResult, CatalogueSort } from "@/lib/types";
import { requestJson } from "@/lib/client";
import { cn, formatCompact, formatNumber } from "@/lib/utils";
import { BreachCard } from "@/components/BreachCard";
import { ErrorBanner, inputClass, Reveal } from "@/components/ui";

const PAGE_SIZE = 24;

const SORTS: { id: CatalogueSort; label: string }[] = [
  { id: "added", label: "Newest added" },
  { id: "date", label: "Breach date" },
  { id: "size", label: "Largest" },
];

interface FeedState {
  breaches: Breach[];
  matching: number;
  total: number;
  totalRecords: number;
}

export function BreachFeed() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState<CatalogueSort>("added");
  const [feed, setFeed] = useState<FeedState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const sequence = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function load(offset: number) {
    const current = ++sequence.current;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ q: debounced, sort, offset: String(offset), limit: String(PAGE_SIZE) });
    try {
      const data = await requestJson<CatalogueResult>(`/api/breaches?${params.toString()}`);
      if (current !== sequence.current) return;
      setFeed((previous) => ({
        breaches: offset === 0 || !previous ? data.breaches : [...previous.breaches, ...data.breaches],
        matching: data.matching,
        total: data.total,
        totalRecords: data.totalRecords,
      }));
    } catch (caught) {
      if (current === sequence.current) setError(caught instanceof Error ? caught.message : "Unexpected error.");
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load(0);
    // load() is recreated each render; the query inputs are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, sort, retryToken]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-neutral-500" aria-hidden />
          <input
            type="search"
            autoComplete="off"
            aria-label="Search breaches"
            placeholder="Search by name, domain or data type, e.g. linkedin, passwords"
            value={query}
            maxLength={80}
            onChange={(event) => setQuery(event.target.value)}
            className={cn(inputClass, "pl-11")}
          />
        </div>
        <div className="flex gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1" role="group" aria-label="Sort breaches">
          {SORTS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={sort === option.id}
              onClick={() => setSort(option.id)}
              className={cn(
                "whitespace-nowrap rounded-full px-3.5 py-1.5 text-[11px] uppercase tracking-[0.12em] transition",
                sort === option.id ? "bg-white text-neutral-950" : "text-neutral-400 hover:text-white",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {feed ? (
        <p className="text-sm text-neutral-400">
          {debounced ? (
            <>
              <span className="font-mono text-neutral-100">{formatNumber(feed.matching)}</span> of{" "}
              {formatNumber(feed.total)} breaches match <span className="text-neutral-200">&ldquo;{debounced}&rdquo;</span>.
            </>
          ) : (
            <>
              <span className="font-mono text-neutral-100">{formatNumber(feed.total)}</span> breaches catalogued,
              covering <span className="font-mono text-neutral-100">{formatCompact(feed.totalRecords)}</span> records.
            </>
          )}
        </p>
      ) : null}

      {error ? (
        <div className="flex flex-col items-start gap-3">
          <ErrorBanner message={error} />
          <button
            type="button"
            onClick={() => setRetryToken((token) => token + 1)}
            className="rounded-full border border-white/15 bg-white/[0.03] px-5 py-2 text-xs uppercase tracking-[0.18em] text-neutral-300 backdrop-blur-md transition hover:border-neutral-500 hover:text-neutral-100"
          >
            Retry
          </button>
        </div>
      ) : null}

      {feed && feed.breaches.length > 0 ? (
        <Reveal className="grid gap-3 lg:grid-cols-2">
          {feed.breaches.map((breach) => (
            <BreachCard key={breach.name} breach={breach} />
          ))}
        </Reveal>
      ) : null}

      {feed && feed.breaches.length === 0 && !loading ? (
        <p className="text-sm text-neutral-500">No catalogued breach matches that search.</p>
      ) : null}

      {loading ? (
        <p className="flex items-center justify-center gap-2 text-sm text-neutral-400">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading breaches
        </p>
      ) : feed && feed.breaches.length < feed.matching ? (
        <button
          type="button"
          onClick={() => void load(feed.breaches.length)}
          className="self-center rounded-full border border-white/15 bg-white/[0.03] px-5 py-2 text-xs uppercase tracking-[0.18em] text-neutral-300 backdrop-blur-md transition hover:border-neutral-500 hover:text-neutral-100"
        >
          Load more ({formatNumber(feed.matching - feed.breaches.length)} remaining)
        </button>
      ) : null}
    </div>
  );
}
