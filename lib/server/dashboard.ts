import type { DashboardBreach, DashboardResult, DashboardSeriesPoint, SourceHealth, StatusResult } from "@/lib/types";
import { loadCatalogueData } from "@/lib/server/breaches";
import { fetchWithTimeout, USER_AGENT } from "@/lib/server/http";

const DAY_MS = 86_400_000;

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function buildDashboard(): Promise<DashboardResult> {
  const { breaches, added } = await loadCatalogueData();
  const now = Date.now();
  const withAdded: DashboardBreach[] = breaches.map((breach) => ({ ...breach, addedDate: added.get(breach.name) || null }));

  // Last 12 calendar months, oldest first, including the current one.
  const months: DashboardSeriesPoint[] = [];
  const cursor = new Date(now);
  cursor.setUTCDate(1);
  for (let i = 11; i >= 0; i -= 1) {
    const month = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - i, 1));
    months.push({ label: monthKey(month), breaches: 0, records: 0 });
  }
  const monthIndex = new Map(months.map((point, index) => [point.label, index]));

  const years = new Map<number, DashboardSeriesPoint>();
  const dataTypes = new Map<string, number>();
  let addedLast30Days = 0;
  let addedLast12Months = 0;
  let recordsAddedLast12Months = 0;
  const twelveMonthsAgo = now - 365 * DAY_MS;

  for (const breach of withAdded) {
    const records = breach.records ?? 0;
    const addedMs = breach.addedDate ? Date.parse(breach.addedDate) : Number.NaN;
    if (Number.isFinite(addedMs)) {
      if (addedMs >= now - 30 * DAY_MS) addedLast30Days += 1;
      if (addedMs >= twelveMonthsAgo) {
        addedLast12Months += 1;
        recordsAddedLast12Months += records;
      }
      const index = monthIndex.get(monthKey(new Date(addedMs)));
      if (index !== undefined) {
        months[index].breaches += 1;
        months[index].records += records;
      }
    }

    const year = breach.date ? Number.parseInt(breach.date.slice(0, 4), 10) : Number.NaN;
    if (Number.isFinite(year)) {
      const point = years.get(year) ?? { label: String(year), breaches: 0, records: 0 };
      point.breaches += 1;
      point.records += records;
      years.set(year, point);
    }

    for (const dataType of breach.dataClasses) dataTypes.set(dataType, (dataTypes.get(dataType) ?? 0) + 1);
  }

  const yearKeys = Array.from(years.keys());
  const firstYear = Math.max(Math.min(...yearKeys), new Date(now).getUTCFullYear() - 19);
  const lastYear = Math.max(...yearKeys);
  const byIncidentYear: DashboardSeriesPoint[] = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    byIncidentYear.push(years.get(year) ?? { label: String(year), breaches: 0, records: 0 });
  }

  const total = withAdded.length;
  return {
    totals: {
      breaches: total,
      records: withAdded.reduce((sum, breach) => sum + (breach.records ?? 0), 0),
      verified: withAdded.filter((breach) => breach.verified).length,
      sensitive: withAdded.filter((breach) => breach.sensitive).length,
      dataTypes: dataTypes.size,
      addedLast30Days,
      addedLast12Months,
      recordsAddedLast12Months,
    },
    addedByMonth: months,
    byIncidentYear,
    topDataTypes: Array.from(dataTypes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, breaches: count, share: total > 0 ? count / total : 0 })),
    largest: [...withAdded].sort((a, b) => (b.records ?? 0) - (a.records ?? 0)).slice(0, 8),
    recent: [...withAdded].sort((a, b) => (b.addedDate ?? "").localeCompare(a.addedDate ?? "")).slice(0, 8),
    generatedAt: new Date(now).toISOString(),
  };
}

// Reachability probes use a fixed, non-personal address and are cached so the dashboard never hammers upstreams.
const PROBE_EMAIL = "tracewatch-health-probe@example.org";

const PROBES: { id: string; label: string; purpose: string; url: string; okStatuses: number[] }[] = [
  {
    id: "hibp",
    label: "Have I Been Pwned",
    purpose: "Breach catalogue",
    url: "https://haveibeenpwned.com/api/v3/latestbreach",
    okStatuses: [200],
  },
  {
    id: "xposedornot",
    label: "XposedOrNot",
    purpose: "Email breaches",
    url: `https://api.xposedornot.com/v1/breach-analytics?email=${encodeURIComponent(PROBE_EMAIL)}`,
    okStatuses: [200, 404],
  },
  {
    id: "leakcheck",
    label: "LeakCheck",
    purpose: "Email breaches",
    url: `https://leakcheck.io/api/public?check=${encodeURIComponent(PROBE_EMAIL)}`,
    okStatuses: [200, 404],
  },
  {
    id: "hudsonrock",
    label: "Hudson Rock",
    purpose: "Infostealer logs",
    url: `https://cavalier.hudsonrock.com/api/json/v2/osint-tools/search-by-email?email=${encodeURIComponent(PROBE_EMAIL)}`,
    okStatuses: [200, 404],
  },
  {
    id: "pwnedpasswords",
    label: "Pwned Passwords",
    purpose: "Password k-anonymity",
    url: "https://api.pwnedpasswords.com/range/00000",
    okStatuses: [200],
  },
  {
    id: "japi",
    label: "japi.rest",
    purpose: "Discord profiles",
    url: "https://japi.rest/discord/v1/user/80351110224678912",
    okStatuses: [200],
  },
];

let statusCache: { expiresAt: number; result: StatusResult } | null = null;

async function probe(target: (typeof PROBES)[number]): Promise<SourceHealth> {
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(target.url, { headers: { "User-Agent": USER_AGENT } }, 8_000);
    await response.arrayBuffer().catch(() => undefined);
    const latencyMs = Date.now() - started;
    const ok = target.okStatuses.includes(response.status);
    return {
      id: target.id,
      label: target.label,
      purpose: target.purpose,
      ok,
      latencyMs,
      detail: ok ? "Operational" : response.status === 429 ? "Rate limited" : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      id: target.id,
      label: target.label,
      purpose: target.purpose,
      ok: false,
      latencyMs: null,
      detail: error instanceof Error ? error.message : "Unreachable",
    };
  }
}

export async function checkSources(): Promise<StatusResult> {
  const now = Date.now();
  if (statusCache && statusCache.expiresAt > now) return statusCache.result;
  const sources = await Promise.all(PROBES.map(probe));
  const result: StatusResult = { sources, checkedAt: new Date(now).toISOString() };
  statusCache = { expiresAt: now + 2 * 60 * 1000, result };
  return result;
}
