"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UpdateStatus } from "@/lib/types";
import { requestJson } from "@/lib/client";
import { formatDate } from "@/lib/utils";
import { Logo } from "@/components/Logo";

const RECHECK_MS = 30 * 60 * 1000;

/**
 * Two operator-facing notices: a toast when GitHub has a newer release than this instance, and a
 * "what's changed" dialog the first time the instance runs after an update. Dismissals are kept in
 * memory only; acknowledging release notes is recorded server-side as a single version string.
 */
export function UpdateNotifier() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [toastDismissed, setToastDismissed] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const check = useCallback(async () => {
    try {
      const next = await requestJson<UpdateStatus>("/api/updates");
      setStatus(next);
      if (next.whatsNew.length > 0) setNotesOpen(true);
    } catch {
      // Update checks are best-effort and never interrupt the app.
    }
  }, []);

  useEffect(() => {
    void check();
    const timer = setInterval(() => void check(), RECHECK_MS);
    return () => clearInterval(timer);
  }, [check]);

  const closeNotes = useCallback(() => {
    setNotesOpen(false);
    void fetch("/api/updates/ack", { method: "POST", cache: "no-store", credentials: "omit" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!notesOpen) return;
    confirmRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeNotes();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [notesOpen, closeNotes]);

  const update = status?.update ?? null;
  const showToast = Boolean(update) && !toastDismissed && !notesOpen;

  return (
    <>
      <AnimatePresence>
        {showToast && update && status ? (
          <motion.aside
            key="update-toast"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="fixed right-4 bottom-4 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-white/15 bg-neutral-950/85 p-4 text-left shadow-[0_24px_80px_rgba(0,0,0,0.7)] backdrop-blur-2xl sm:right-6 sm:bottom-6"
          >
            <div className="flex items-start gap-3">
              <motion.span
                className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] text-white"
                animate={{ rotate: [0, -8, 8, -4, 0] }}
                transition={{ duration: 1.2, delay: 0.4, repeat: 2, repeatDelay: 2.5 }}
              >
                <Logo className="size-9" />
              </motion.span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-400">
                  <span className="tw-pulse size-1.5 rounded-full bg-white" aria-hidden />
                  New update · v{update.version}
                </p>
                <p className="mt-1 text-base font-semibold text-white">NEW UPDATE pull from GitHub!</p>
                <p className="mt-0.5 truncate text-xs text-neutral-400">{update.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setToastDismissed(true)}
                aria-label="Dismiss update notice"
                className="-mt-1 -mr-1 rounded-full p-1.5 text-neutral-500 transition hover:bg-white/10 hover:text-white"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            {showSteps ? (
              <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-neutral-300">
                <p className="text-neutral-500"># macOS / Linux</p>
                <p>./start.sh update</p>
                <p className="text-neutral-500"># Windows</p>
                <p>start.bat update</p>
                <p className="text-neutral-500"># Docker</p>
                <p>git pull && docker compose up -d --build</p>
              </div>
            ) : null}

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSteps((value) => !value)}
                className="rounded-full bg-white px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-950 transition hover:bg-neutral-200"
              >
                {showSteps ? "Hide steps" : "How to update"}
              </button>
              <a
                href={update.link?.url ?? status.repository}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3.5 py-1.5 text-[10px] uppercase tracking-[0.18em] text-neutral-300 transition hover:border-white/35 hover:text-white"
              >
                {update.link?.label ?? "GitHub"}
                <ExternalLink className="size-3" aria-hidden />
              </a>
              <span className="ml-auto font-mono text-[10px] text-neutral-600">you run v{status.current}</span>
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {notesOpen && status && status.whatsNew.length > 0 ? (
          <motion.div
            key="whats-new"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(event) => {
              if (event.target === event.currentTarget) closeNotes();
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="whats-new-title"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/15 bg-neutral-950/90 shadow-[0_40px_120px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
            >
              <div className="flex items-center gap-4 border-b border-white/[0.08] p-5">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06] text-white">
                  <Logo className="size-11" />
                </span>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-400">
                    Updated to v{status.current}
                  </p>
                  <h2 id="whats-new-title" className="mt-1 text-xl font-semibold tracking-tight text-white">
                    What&apos;s changed
                  </h2>
                </div>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto p-5">
                {status.whatsNew.map((release) => (
                  <section key={release.version}>
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-sm font-semibold text-neutral-100">{release.title}</h3>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                        v{release.version} · {formatDate(release.date)}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1.5 text-sm text-neutral-300">
                      {release.changes.map((change) => (
                        <li key={change} className="flex gap-2">
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-white/70" aria-hidden />
                          {change}
                        </li>
                      ))}
                    </ul>
                    {release.link ? (
                      <a
                        href={release.link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-[10px] uppercase tracking-[0.18em] text-neutral-200 transition hover:border-white/35 hover:text-white"
                      >
                        {release.link.label}
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                    ) : null}
                  </section>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] p-4">
                <a
                  href={`${status.repository}/blob/main/changelog.json`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] uppercase tracking-[0.18em] text-neutral-500 transition hover:text-white"
                >
                  Full changelog
                </a>
                <button
                  ref={confirmRef}
                  type="button"
                  onClick={closeNotes}
                  className="rounded-full bg-white px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-950 transition hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
