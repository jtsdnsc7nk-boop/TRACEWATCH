"use client";

import { type FormEvent, useState } from "react";
import type { PhoneScanResult } from "@/lib/types";
import { requestJson, useScan } from "@/lib/client";
import { maskTail, useSessionLog } from "@/lib/session";
import { Card, DataRow, ErrorBanner, Field, inputClass, Reveal, RiskPanel, ScanButton } from "@/components/ui";

export function PhonePanel() {
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const scan = useScan<PhoneScanResult>();
  const session = useSessionLog();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void scan.run(async () => {
      const result = await requestJson<PhoneScanResult>("/api/scan/phone", { phone, region });
      session.record({
        kind: "phone",
        target: maskTail(result.formats?.e164 ?? result.input, 3),
        score: result.risk.score,
        level: result.risk.level,
        summary: `${result.valid ? "Valid" : "Invalid"} · ${result.lineType}${result.region ? ` · ${result.region}` : ""}`,
      });
      return result;
    });
  }

  const result = scan.data;

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <Field label="Phone number" htmlFor="phone-input" hint="Include the country code, or set a default region.">
            <input
              id="phone-input"
              type="tel"
              required
              maxLength={32}
              autoComplete="off"
              placeholder="+1 415 555 2671"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="sm:w-36">
          <Field label="Default region" htmlFor="region-input">
            <input
              id="region-input"
              type="text"
              maxLength={2}
              autoComplete="off"
              spellCheck={false}
              placeholder="US"
              value={region}
              onChange={(event) => setRegion(event.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="sm:pt-[22px]">
          <ScanButton loading={scan.loading} disabled={!phone.trim()}>
            Analyse number
          </ScanButton>
        </div>
      </form>

      {scan.error ? <ErrorBanner message={scan.error} /> : null}

      {result ? (
        <Reveal className="flex flex-col gap-5">
          <RiskPanel risk={result.risk} title="Number risk" />
          <Card>
            <dl>
              <DataRow label="Valid" value={result.valid ? "Yes" : "No"} />
              <DataRow label="Possible" value={result.possible ? "Yes" : "No"} />
              <DataRow label="Line type" value={result.lineType} mono={false} />
              <DataRow
                label="Country"
                value={result.countryName ? `${result.countryName} (${result.region})` : "Unknown"}
                mono={false}
              />
              <DataRow
                label="Calling code"
                value={result.countryCallingCode !== null ? `+${result.countryCallingCode}` : "Unknown"}
              />
              <DataRow label="National number" value={result.nationalNumber ?? "Unknown"} />
              {result.formats ? (
                <>
                  <DataRow label="E.164" value={result.formats.e164} />
                  <DataRow label="International" value={result.formats.international} />
                  <DataRow label="National" value={result.formats.national} />
                  <DataRow label="RFC 3966" value={result.formats.rfc3966} />
                </>
              ) : null}
            </dl>
          </Card>
        </Reveal>
      ) : null}
    </div>
  );
}
