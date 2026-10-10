"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { RiskLevel } from "@/lib/types";

export type ScanKind = "email" | "username" | "password" | "phone" | "discord";

export interface SessionScan {
  id: number;
  kind: ScanKind;
  /** Masked target: enough to recognise your own query, never the full value. */
  target: string;
  score: number;
  level: RiskLevel;
  summary: string;
  at: number;
}

interface SessionLog {
  scans: SessionScan[];
  record: (scan: Omit<SessionScan, "id" | "at">) => void;
  clear: () => void;
}

const SessionContext = createContext<SessionLog | null>(null);
const MAX_SCANS = 50;

/**
 * Scan history for the current tab only. It lives in React state: nothing is written to storage
 * or sent anywhere, and it disappears on reload.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [scans, setScans] = useState<SessionScan[]>([]);

  useEffect(() => {
    // If the browser restores this page from its back/forward cache, results from before the user left would
    // reappear. Reload instead so returning to TraceWatch always starts empty.
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) window.location.reload();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const record = useCallback((scan: Omit<SessionScan, "id" | "at">) => {
    setScans((previous) => [{ ...scan, id: Date.now() + Math.random(), at: Date.now() }, ...previous].slice(0, MAX_SCANS));
  }, []);

  const clear = useCallback(() => setScans([]), []);
  const value = useMemo(() => ({ scans, record, clear }), [scans, record, clear]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionLog(): SessionLog {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSessionLog must be used inside SessionProvider.");
  return context;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, Math.min(2, Math.max(1, local.length - 1)));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

export function maskTail(value: string, keep: number): string {
  const compact = value.replace(/\s+/g, "");
  if (compact.length <= keep) return compact;
  return `${"*".repeat(compact.length - keep)}${compact.slice(-keep)}`;
}
