"use client";

import { Eye, EyeOff } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { PasswordRangeResult, RiskAssessment } from "@/lib/types";
import { requestJson, useScan } from "@/lib/client";
import { useSessionLog } from "@/lib/session";
import { assessPassword, countInRange, estimateStrength, sha1Hex } from "@/lib/password";
import { ErrorBanner, Field, inputClass, Notice, Reveal, RiskPanel, ScanButton } from "@/components/ui";

interface PasswordOutcome {
  prefix: string;
  risk: RiskAssessment;
}

export function PasswordPanel() {
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const scan = useScan<PasswordOutcome>();
  const session = useSessionLog();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = password;
    void scan.run(async () => {
      const hash = await sha1Hex(candidate);
      const prefix = hash.slice(0, 5);
      const { range } = await requestJson<PasswordRangeResult>("/api/scan/password", { prefix });
      const count = countInRange(range, hash.slice(5));
      const risk = assessPassword(count, estimateStrength(candidate));
      session.record({
        kind: "password",
        target: "Password (never stored)",
        score: risk.score,
        level: risk.level,
        summary: count > 0 ? `Seen ${count.toLocaleString("en-US")} times in breaches` : "Not found in breach corpora",
      });
      return { prefix, risk };
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Password" htmlFor="password-input">
            <div className="relative">
              <input
                id="password-input"
                type={shown ? "text" : "password"}
                required
                maxLength={256}
                autoComplete="off"
                spellCheck={false}
                placeholder="Enter a password to test"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (scan.data || scan.error) scan.reset();
                }}
                className={`${inputClass} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShown((value) => !value)}
                aria-label={shown ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-neutral-500 transition hover:text-neutral-200"
              >
                {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            </div>
          </Field>
        </div>
        <ScanButton loading={scan.loading} disabled={!password}>
          Check password
        </ScanButton>
      </form>

      <Notice>
        The password is hashed in your browser with SHA-1. Only the first 5 of 40 hash characters are sent, and the match is
        completed locally (k-anonymity), so neither TraceWatch nor the upstream API ever sees the password or its full hash.
      </Notice>

      {scan.error ? <ErrorBanner message={scan.error} /> : null}

      {scan.data ? (
        <Reveal className="flex flex-col gap-3">
          <RiskPanel risk={scan.data.risk} title="Password risk" />
          <p className="font-mono text-xs text-neutral-500">
            Transmitted hash prefix: <span className="text-neutral-300">{scan.data.prefix}</span>
          </p>
        </Reveal>
      ) : null}
    </div>
  );
}
