"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, AtSign, Hash, KeyRound, LayoutDashboard, Lock, Phone, Rss, UserSearch } from "lucide-react";
import Link from "next/link";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { CatalogueResult } from "@/lib/types";
import { requestJson } from "@/lib/client";
import { cn, formatCompact, formatNumber } from "@/lib/utils";
import { Backdrop } from "@/components/Backdrop";
import { Logo } from "@/components/Logo";
import { BreachFeed } from "@/components/BreachFeed";
import { DiscordPanel } from "@/components/DiscordPanel";
import { EmailPanel } from "@/components/EmailPanel";
import { PasswordPanel } from "@/components/PasswordPanel";
import { PhonePanel } from "@/components/PhonePanel";
import { UsernamePanel } from "@/components/UsernamePanel";

const TABS = [
  { id: "email", label: "Email", icon: AtSign, blurb: "Find which known data breaches and pastes contain an email address." },
  { id: "username", label: "Username", icon: UserSearch, blurb: "Find which of 42 sites have a public profile with this username." },
  { id: "password", label: "Password", icon: KeyRound, blurb: "Check a password against breach corpora without it leaving your browser." },
  { id: "phone", label: "Phone", icon: Phone, blurb: "Validate a number and identify its region, line type and abuse potential." },
  { id: "discord", label: "Discord", icon: Hash, blurb: "Inspect the public signals of a Discord account from its user ID." },
  { id: "feed", label: "Breach feed", icon: Rss, blurb: "Search and browse every catalogued breach." },
] as const;

type TabId = (typeof TABS)[number]["id"];

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (delay: number) => ({ opacity: 1, y: 0, transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] as const } }),
};

export function TraceWatchApp() {
  const [active, setActive] = useState<TabId>("email");
  const [indexed, setIndexed] = useState<{ breaches: number; records: number } | null>(null);
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const consoleRef = useRef<HTMLDivElement>(null);
  const activeTab = TABS.find((tab) => tab.id === active) ?? TABS[0];

  useEffect(() => {
    function openFromHash() {
      const fromHash = window.location.hash.slice(1);
      const match = TABS.find((tab) => tab.id === fromHash);
      if (!match) return;
      setActive(match.id);
      requestAnimationFrame(() => consoleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    requestJson<CatalogueResult>("/api/breaches?limit=1")
      .then((data) => {
        if (!cancelled) setIndexed({ breaches: data.total, records: data.totalRecords });
      })
      .catch(() => {
        if (!cancelled) setIndexed(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function openTab(id: TabId) {
    setActive(id);
    consoleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = TABS.findIndex((tab) => tab.id === active);
    const next = TABS[(index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    setActive(next.id);
    tabRefs.current[next.id]?.focus();
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <Backdrop />

      <header className="absolute inset-x-0 top-0 z-20 flex items-start justify-between px-5 pt-7 sm:px-9 sm:pt-9">
        <a href="#" className="flex items-center gap-2.5 text-white" aria-label="TraceWatch home">
          <Logo className="size-8" />
          <span className="text-xs font-medium tracking-[0.3em]">TRACEWATCH</span>
        </a>

        <div className="flex items-start gap-10">
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-950 shadow-[0_0_24px_rgba(255,255,255,0.12)] transition hover:bg-neutral-200"
            >
              <LayoutDashboard className="size-3" aria-hidden />
              Dashboard
            </Link>
            <span className="hidden items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-300 backdrop-blur-md sm:inline-flex">
              <Lock className="size-3" aria-hidden />
              Zero persistence
            </span>
          </div>
          <nav aria-label="Scanners" className="hidden flex-col items-end gap-1.5 md:flex">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => openTab(tab.id)}
                className={cn(
                  "text-xs uppercase tracking-[0.3em] transition",
                  tab.id === active ? "text-white" : "text-neutral-400 hover:text-white",
                )}
              >
                {tab.label}
              </button>
            ))}
            <Link
              href="/dashboard"
              className="mt-2 inline-flex items-center gap-1 border-t border-white/10 pt-2 text-xs uppercase tracking-[0.3em] text-neutral-400 transition hover:text-white"
            >
              Dashboard
              <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative z-10 flex min-h-[78vh] flex-col items-center justify-center px-5 pt-28 pb-12 text-center">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 hidden overflow-hidden md:block">
          <motion.div
            initial={{ opacity: 0, x: -60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1.4, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            <div className="tw-hand tw-hand-left" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1.4, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            <div className="tw-hand tw-hand-right" />
          </motion.div>
        </div>
        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={0.1}
          className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-400"
        >
          <span className="flex items-center gap-1.5 text-neutral-300">
            <span className="tw-pulse size-1.5 rounded-full bg-white" aria-hidden />
            Live
          </span>
          <span className="h-3 w-px bg-white/20" aria-hidden />
          {indexed !== null ? (
            <span>
              <span className="text-sm tracking-[0.12em] text-neutral-100">{formatNumber(indexed.breaches)}</span> breaches
              <span className="mx-2 text-neutral-600">·</span>
              <span className="text-sm tracking-[0.12em] text-neutral-100">{formatCompact(indexed.records)}</span> records
              indexed
            </span>
          ) : (
            <span>Breach intelligence</span>
          )}
        </motion.p>

        <motion.h1
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={0.25}
          className="mt-6 text-5xl font-semibold tracking-[-0.035em] text-white sm:text-6xl"
        >
          Trace your onl<span className="font-light italic">i</span>ne self
        </motion.h1>

        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={0.4}
          className="mt-7 max-w-xl text-sm leading-relaxed text-neutral-400"
        >
          Check what attackers may already know about an account you own or are authorised to assess. Pick a scanner,
          press Enter, and see the traces left behind. Queries are processed in memory and never logged, stored or
          cached.
        </motion.p>

        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0.55} className="mt-9">
          <button
            type="button"
            onClick={() => openTab(active)}
            className="rounded-full border border-white/15 bg-white/[0.05] px-6 py-3 text-xs uppercase tracking-[0.25em] text-neutral-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition hover:border-white/35 hover:text-white"
          >
            Start a scan
          </button>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-600">
            Sensitive fields masked · nothing stored
          </p>
        </motion.div>
      </section>

      <motion.div
        ref={consoleRef}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mx-auto w-full max-w-5xl scroll-mt-6 px-4 pb-16 sm:px-6"
      >
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/55 shadow-[0_40px_120px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl">
          <div className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-3.5">
            <span className="flex gap-1.5" aria-hidden>
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500">
              tracewatch / {activeTab.label.toLowerCase()}
            </span>
          </div>

          <main className="flex flex-col gap-6 p-5 sm:p-7">
            <div
              role="tablist"
              aria-label="Scanners"
              onKeyDown={onKeyDown}
              className="flex gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/[0.03] p-1"
            >
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const selected = tab.id === active;
                return (
                  <button
                    key={tab.id}
                    ref={(node) => {
                      tabRefs.current[tab.id] = node;
                    }}
                    role="tab"
                    type="button"
                    id={`tab-${tab.id}`}
                    aria-selected={selected}
                    aria-controls={`panel-${tab.id}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setActive(tab.id)}
                    className={cn(
                      "inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-xs font-medium uppercase tracking-[0.15em] transition focus-visible:outline-2 focus-visible:outline-white",
                      selected
                        ? "bg-white text-neutral-950 shadow-[0_0_24px_rgba(255,255,255,0.15)]"
                        : "text-neutral-400 hover:text-white",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <p className="text-sm text-neutral-400">{activeTab.blurb}</p>

            {/* Panels stay mounted so switching tabs does not discard an in-memory result. */}
            {TABS.map((tab) => (
              <section
                key={tab.id}
                role="tabpanel"
                id={`panel-${tab.id}`}
                aria-labelledby={`tab-${tab.id}`}
                hidden={tab.id !== active}
              >
                {tab.id === "email" ? <EmailPanel /> : null}
                {tab.id === "username" ? <UsernamePanel /> : null}
                {tab.id === "password" ? <PasswordPanel /> : null}
                {tab.id === "phone" ? <PhonePanel /> : null}
                {tab.id === "discord" ? <DiscordPanel /> : null}
                {tab.id === "feed" && active === "feed" ? <BreachFeed /> : null}
              </section>
            ))}
          </main>
        </div>

        <footer className="mt-8 text-center font-mono text-[10px] uppercase leading-relaxed tracking-[0.2em] text-neutral-600">
          Have I Been Pwned · XposedOrNot · LeakCheck · Hudson Rock · 42 profile sites · Pwned Passwords · libphonenumber · Discord API
          <br />
          Only look up accounts you own or have permission to assess. Results are indicators, not proof.
          <br />
          No cookies · no storage · leave the page and everything is gone. Searched values are forwarded to the sources
          above, which have their own privacy policies.
        </footer>
      </motion.div>
    </div>
  );
}
