"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Release, UpdateStatus } from "@/lib/types";
import { requestJson } from "@/lib/client";
import asciiArt from "@/lib/ascii-art.json";
import { formatDate } from "@/lib/utils";
import { CliLaunchButton } from "@/components/CliLaunchButton";
import { Logo } from "@/components/Logo";

const RECHECK_MS = 30 * 60 * 1000;

// The one value TraceWatch keeps in the browser: that this visitor has already seen the CLI intro.
// It holds no search data, is never sent anywhere, and the page works the same if storage is blocked.
const INTRO_KEY = "tracewatch:seen-cli-intro";

const CLI_INTRO: NonNullable<Release["featured"]> = {
  title: "TraceWatch, now in your terminal",
  description:
    "A full command-line app with the TraceWatch cat in ASCII art. Pick what to search with the arrow keys: email exposure, usernames on 42 sites, passwords, phone numbers, Discord accounts or the breach catalogue. When you quit, it wipes the terminal so nothing you searched stays on screen.",
  command: "./start.sh cli",
  action: "launch-cli",
};

function hasSeenIntro(): boolean {
  try {
    return window.localStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return false;
  }
}

function markIntroSeen(): void {
  try {
    window.localStorage.setItem(INTRO_KEY, "1");
  } catch {
    // Storage blocked (private window): the in-memory guard still shows it only once per page.
  }
}

/**
 * Three notices: a toast when GitHub has a newer release than this instance, a "what's changed"
 * dialog the first time the instance runs after an update (acknowledged server-side as a single
 * version string), and a one-time "now in your terminal" intro for every visitor.
 */
export function UpdateNotifier() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [toastDismissed, setToastDismissed] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const introShown = useRef(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const check = useCallback(async () => {
    try {
      const next = await requestJson<UpdateStatus>("/api/updates");
      setStatus(next);
      if (next.whatsNew.length > 0) setNotesOpen(true);
      else if (!introShown.current && !hasSeenIntro()) {
        introShown.current = true;
        setIntroOpen(true);
      }
    } catch {
      // Update checks are best-effort and never interrupt the app.
    }
  }, []);

  useEffect(() => {
    void check();
    const timer = setInterval(() => void check(), RECHECK_MS);
    return () => clearInterval(timer);
  }, [check]);

  const closeIntro = useCallback(() => {
    setIntroOpen(false);
    markIntroSeen();
  }, []);

  const closeNotes = useCallback(() => {
    setNotesOpen(false);
    // Release notes that already presented the CLI count as having seen the intro.
    if (status?.whatsNew.some((release) => release.featured?.action === "launch-cli")) {
      introShown.current = true;
      markIntroSeen();
    }
    void fetch("/api/updates/ack", { method: "POST", cache: "no-store", credentials: "omit" }).catch(() => undefined);
  }, [status]);

  useEffect(() => {
    if (!notesOpen && !introOpen) return;
    confirmRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (notesOpen) closeNotes();
      else closeIntro();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [notesOpen, introOpen, closeNotes, closeIntro]);

  const update = status?.update ?? null;
  const showToast = Boolean(update) && !toastDismissed && !notesOpen && !introOpen;

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
              className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-neutral-950/90 shadow-[0_40px_120px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
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
                  <section key={release.version} className="flex flex-col gap-1">
                    {release.featured ? <FeaturedCard featured={release.featured} label={`Main update · v${release.version}`} /> : null}
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

      <AnimatePresence>
        {introOpen && !notesOpen ? (
          <motion.div
            key="cli-intro"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(event) => {
              if (event.target === event.currentTarget) closeIntro();
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="cli-intro-title"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-neutral-950/90 shadow-[0_40px_120px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
            >
              <div className="flex items-center gap-4 border-b border-white/[0.08] p-5">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06] text-white">
                  <Logo className="size-11" />
                </span>
                <div>
                  <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-400">
                    <span className="tw-pulse size-1.5 rounded-full bg-white" aria-hidden />
                    New
                  </p>
                  <h2 id="cli-intro-title" className="mt-1 text-xl font-semibold tracking-tight text-white">
                    Now in your terminal
                  </h2>
                </div>
              </div>
              <div className="overflow-y-auto p-5">
                <FeaturedCard featured={CLI_INTRO} label="tracewatch-cli" />
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] p-4">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600">Shown once</span>
                <button
                  ref={confirmRef}
                  type="button"
                  onClick={closeIntro}
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

function FeaturedCard({ featured, label }: { featured: NonNullable<Release["featured"]>; label: string }) {
  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-white/15 bg-black/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
        <span className="size-2 rounded-full bg-white/20" aria-hidden />
        <span className="size-2 rounded-full bg-white/20" aria-hidden />
        <span className="size-2 rounded-full bg-white/20" aria-hidden />
        <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
          {label}
        </span>
      </div>
      <div className="flex flex-col items-center gap-3 px-4 pt-4 pb-5 text-center">
        <ScrambleArt
          lines={asciiArt.logo}
          className="bg-gradient-to-b from-white to-neutral-500 bg-clip-text font-mono text-[5px] leading-[5px] text-transparent sm:text-[6px] sm:leading-[6px]"
        />
        <ScrambleArt lines={asciiArt.name} delayFrames={6} className="font-mono text-[4.5px] leading-[5px] text-white sm:text-[5.5px] sm:leading-[6px]" />
        <h3 className="mt-1 text-lg font-semibold tracking-tight text-white">{featured.title}</h3>
        <p className="max-w-md text-sm leading-relaxed text-neutral-400">{featured.description}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {featured.action === "launch-cli" ? <CliLaunchButton variant="solid" /> : null}
          {featured.command ? (
            <code className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[11px] text-neutral-300">
              {featured.command}
            </code>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const NOISE = "░▒▓▚▞▖▗▘▝▙▟";
const SCRAMBLE_FRAMES = 22;

/** ASCII art that "decrypts" out of noise, matching the CLI intro. Static when reduced motion is preferred. */
function ScrambleArt({ lines, className, delayFrames = 0 }: { lines: string[]; className?: string; delayFrames?: number }) {
  const total = SCRAMBLE_FRAMES + delayFrames;
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFrame(total);
      return;
    }
    let current = 0;
    const timer = setInterval(() => {
      current += 1;
      setFrame(current);
      if (current >= total) clearInterval(timer);
    }, 40);
    return () => clearInterval(timer);
  }, [total]);

  const text = lines
    .map((line, row) =>
      Array.from(line)
        .map((char, col) => {
          if (char === " " || frame >= total) return char;
          // Deterministic per-glyph reveal time, so renders stay pure.
          const revealAt = delayFrames + (((row * 73 + col * 151) % 97) / 97) * SCRAMBLE_FRAMES * 0.85;
          return frame >= revealAt ? char : NOISE[(row * 7 + col * 13 + frame * 5) % NOISE.length];
        })
        .join(""),
    )
    .join("\n");

  return (
    <pre aria-hidden className={className}>
      {text}
    </pre>
  );
}
