export type RiskLevel = "none" | "low" | "moderate" | "high" | "critical";

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  factors: string[];
  recommendations: string[];
}

export type BreachSource = "hibp" | "xposedornot" | "leakcheck";

export const SOURCE_LABELS: Record<BreachSource, string> = {
  hibp: "HIBP",
  xposedornot: "XposedOrNot",
  leakcheck: "LeakCheck",
};

export interface Breach {
  name: string;
  title: string;
  domain: string | null;
  /** ISO date (YYYY-MM-DD), year-month (YYYY-MM) or a bare year, depending on source precision. */
  date: string | null;
  records: number | null;
  dataClasses: string[];
  description: string;
  verified: boolean;
  sensitive: boolean;
  /** Every intelligence source that reported this breach for the queried account. */
  sources: BreachSource[];
}

export interface SourceStatus {
  id: string;
  label: string;
  status: "ok" | "error" | "skipped";
  found: number;
  message?: string;
}

/** An infostealer infection linked to the address. Identifying device details are deliberately omitted. */
export interface InfostealerHit {
  dateCompromised: string | null;
  operatingSystem: string | null;
  corporateServices: number;
  userServices: number;
  antivirusCount: number;
}

export interface EmailScanResult {
  email: string;
  breaches: Breach[];
  pasteCount: number;
  infostealers: InfostealerHit[];
  /** Data types the sources report as exposed somewhere for this address. */
  exposedFields: string[];
  sources: SourceStatus[];
  risk: RiskAssessment;
  notices: string[];
}

export interface PhoneScanResult {
  input: string;
  valid: boolean;
  possible: boolean;
  region: string | null;
  countryName: string | null;
  countryCallingCode: number | null;
  nationalNumber: string | null;
  lineType: string;
  formats: {
    e164: string;
    international: string;
    national: string;
    rfc3966: string;
  } | null;
  risk: RiskAssessment;
}

export interface DiscordBadge {
  key: string;
  label: string;
}

export interface DiscordScanResult {
  id: string;
  createdAt: string;
  accountAgeDays: number;
  defaultAvatarUrl: string;
  live: boolean;
  profile: {
    username: string;
    globalName: string | null;
    discriminator: string | null;
    isBot: boolean;
    isSystem: boolean;
    avatarUrl: string;
    bannerUrl: string | null;
    accentColor: string | null;
    serverTag: string | null;
    decorationUrl: string | null;
    badges: DiscordBadge[];
  } | null;
  /** Where the profile came from: Discord directly (bot token), the public japi.rest mirror, or the ID alone. */
  dataSource: "discord" | "japi" | "offline";
  risk: RiskAssessment;
  notices: string[];
}

export interface PasswordRangeResult {
  prefix: string;
  /** Raw "SUFFIX:COUNT" lines from the k-anonymity range API. */
  range: string;
}

export type CatalogueSort = "added" | "date" | "size";

export interface CatalogueResult {
  breaches: Breach[];
  /** Breaches matching the current search. */
  matching: number;
  /** Breaches in the whole catalogue. */
  total: number;
  /** Sum of records across the whole catalogue. */
  totalRecords: number;
  offset: number;
}

export type UsernameCategory = "social" | "developer" | "gaming" | "creative" | "community";

export interface UsernameSiteResult {
  id: string;
  name: string;
  category: UsernameCategory;
  profileUrl: string;
  /** found: profile exists · not_found: confirmed absent · unknown: site blocked or errored · invalid: name not allowed there */
  status: "found" | "not_found" | "unknown" | "invalid";
  detail?: string;
}

export interface UsernameScanResult {
  username: string;
  results: UsernameSiteResult[];
  found: number;
  checked: number;
  durationMs: number;
}

export interface DashboardSeriesPoint {
  label: string;
  breaches: number;
  records: number;
}

export interface DashboardBreach extends Breach {
  addedDate: string | null;
}

export interface DashboardResult {
  totals: {
    breaches: number;
    records: number;
    verified: number;
    sensitive: number;
    dataTypes: number;
    addedLast30Days: number;
    addedLast12Months: number;
    recordsAddedLast12Months: number;
  };
  addedByMonth: DashboardSeriesPoint[];
  byIncidentYear: DashboardSeriesPoint[];
  topDataTypes: { name: string; breaches: number; share: number }[];
  largest: DashboardBreach[];
  recent: DashboardBreach[];
  generatedAt: string;
}

export interface SourceHealth {
  id: string;
  label: string;
  purpose: string;
  ok: boolean;
  latencyMs: number | null;
  detail: string;
}

export interface StatusResult {
  sources: SourceHealth[];
  checkedAt: string;
}

export interface Release {
  version: string;
  date: string;
  title: string;
  changes: string[];
  /** Optional call to action shown with the release, e.g. a download. Only https links are honoured. */
  link?: { label: string; url: string };
}

export interface UpdateStatus {
  current: string;
  repository: string;
  /** Newest release published on GitHub, when it is newer than this instance. */
  update: Release | null;
  /** Releases installed since the operator last acknowledged the "what's new" popup. */
  whatsNew: Release[];
  checkEnabled: boolean;
}

export interface ApiError {
  error: string;
}
