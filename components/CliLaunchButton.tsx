"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, LoaderCircle, SquareTerminal, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type LaunchState =
  | { kind: "idle" }
  | { kind: "launching" }
  | { kind: "launched"; terminal: string }
  | { kind: "manual"; reason: string };

const MANUAL_COMMANDS = [
  { label: "macOS / Linux", command: "./start.sh cli" },
  { label: "Windows", command: "start.bat cli" },
  { label: "Any system", command: "npm run cli" },
];

/** Asks the local TraceWatch server to open the CLI in a new terminal window, with manual steps as a fallback. */
export function CliLaunchButton({ variant = "pill", className }: { variant?: "pill" | "solid"; className?: string }) {
  const [state, setState] = useState<LaunchState>({ kind: "idle" });

  async function launch() {
    setState({ kind: "launching" });
    try {
      const response = await fetch("/api/cli/launch", {
        method: "POST",
        headers: { "x-tracewatch-action": "launch-cli" },
        cache: "no-store",
        credentials: "omit",
      });
      const data = (await response.json().catch(() => null)) as
        | { launched: true; terminal: string }
        | { launched: false; reason: string }
        | { error: string }
        | null;
      if (data && "launched" in data && data.launched) setState({ kind: "launched", terminal: data.terminal });
      else
        setState({
          kind: "manual",
          reason: data && "reason" in data ? data.reason : data && "error" in data ? data.error : "The server could not open a terminal.",
        });
    } catch {
      setState({ kind: "manual", reason: "The TraceWatch server could not be reached." });
    }
  }

  return (
    <div className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => void launch()}
        disabled={state.kind === "launching"}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.2em] transition disabled:opacity-60",
          variant === "solid"
            ? "bg-white px-4 py-2 text-neutral-950 shadow-[0_0_24px_rgba(255,255,255,0.15)] hover:bg-neutral-200"
            : "border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-neutral-200 backdrop-blur-md hover:border-white/35 hover:text-white",
        )}
      >
        {state.kind === "launching" ? (
          <LoaderCircle className="size-3 animate-spin" aria-hidden />
        ) : (
          <SquareTerminal className="size-3" aria-hidden />
        )}
        Open CLI
      </button>

      <AnimatePresence>
        {state.kind === "launched" || state.kind === "manual" ? (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute top-full right-0 z-40 mt-2 w-72 rounded-xl border border-white/15 bg-neutral-950/95 p-3 text-left shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-start gap-2">
              {state.kind === "launched" ? (
                <Check className="mt-0.5 size-4 shrink-0 text-white" aria-hidden />
              ) : (
                <SquareTerminal className="mt-0.5 size-4 shrink-0 text-neutral-400" aria-hidden />
              )}
              <p className="flex-1 text-xs leading-relaxed text-neutral-300">
                {state.kind === "launched"
                  ? `The TraceWatch CLI opened in a new ${state.terminal} window.`
                  : `${state.reason} Run it yourself from the TraceWatch folder:`}
              </p>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setState({ kind: "idle" })}
                className="-mt-1 -mr-1 rounded-full p-1 text-neutral-500 hover:text-white"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
            {state.kind === "manual" ? (
              <dl className="mt-2 space-y-1 rounded-lg bg-black/40 p-2 font-mono text-[11px]">
                {MANUAL_COMMANDS.map((item) => (
                  <div key={item.label} className="flex justify-between gap-3">
                    <dt className="text-neutral-500">{item.label}</dt>
                    <dd className="text-neutral-200">{item.command}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
