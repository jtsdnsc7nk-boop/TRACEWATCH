"use client";

import Image from "next/image";
import { type FormEvent, useState } from "react";
import type { DiscordScanResult } from "@/lib/types";
import { requestJson, useScan } from "@/lib/client";
import { maskTail, useSessionLog } from "@/lib/session";
import { formatDate, formatNumber } from "@/lib/utils";
import { Card, DataRow, ErrorBanner, Field, inputClass, Notice, Reveal, RiskPanel, ScanButton } from "@/components/ui";

export function DiscordPanel() {
  const [id, setId] = useState("");
  const scan = useScan<DiscordScanResult>();
  const session = useSessionLog();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void scan.run(async () => {
      const result = await requestJson<DiscordScanResult>("/api/scan/discord", { id });
      session.record({
        kind: "discord",
        target: result.profile ? `@${result.profile.username}` : maskTail(result.id, 4),
        score: result.risk.score,
        level: result.risk.level,
        summary: `${Math.floor(result.accountAgeDays / 365)}y old account${result.profile ? "" : " · no profile"}`,
      });
      return result;
    });
  }

  const result = scan.data;
  const profile = result?.profile ?? null;

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <Field
            label="Discord user ID"
            htmlFor="discord-input"
            hint="Enable Developer Mode in Discord, then right-click a user and choose Copy User ID."
          >
            <input
              id="discord-input"
              type="text"
              inputMode="numeric"
              required
              maxLength={20}
              autoComplete="off"
              placeholder="80351110224678912"
              value={id}
              onChange={(event) => setId(event.target.value.replace(/\D/g, ""))}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="sm:pt-[22px]">
          <ScanButton loading={scan.loading} disabled={id.length < 17}>
            Inspect account
          </ScanButton>
        </div>
      </form>

      {scan.error ? <ErrorBanner message={scan.error} /> : null}

      {result ? (
        <Reveal className="flex flex-col gap-5">
          {result.notices.map((notice) => (
            <Notice key={notice}>{notice}</Notice>
          ))}

          <Card className="overflow-hidden p-0">
            <div
              className="relative h-28 w-full bg-white/5"
              style={profile?.accentColor && !profile.bannerUrl ? { backgroundColor: profile.accentColor } : undefined}
            >
              {profile?.bannerUrl ? (
                <Image src={profile.bannerUrl} alt="" fill unoptimized sizes="100vw" className="object-cover" />
              ) : null}
            </div>
            <div className="flex flex-col gap-4 p-5">
              <div className="-mt-14 flex items-end gap-4">
                <div className="relative size-[88px] shrink-0">
                  <Image
                    src={profile?.avatarUrl ?? result.defaultAvatarUrl}
                    alt={profile ? `Avatar of ${profile.username}` : "Default avatar"}
                    width={88}
                    height={88}
                    unoptimized
                    className="relative rounded-full border-4 border-neutral-950 bg-neutral-950"
                  />
                  {profile?.decorationUrl ? (
                    <Image
                      src={profile.decorationUrl}
                      alt=""
                      width={106}
                      height={106}
                      unoptimized
                      className="pointer-events-none absolute -top-[9px] -left-[9px] max-w-none"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 pb-1">
                  <p className="truncate text-lg font-semibold text-neutral-100">
                    {profile ? (profile.globalName ?? profile.username) : result.live ? "User not found" : "Profile unavailable"}
                  </p>
                  {profile ? (
                    <p className="truncate font-mono text-sm text-neutral-400">
                      @{profile.username}
                      {profile.discriminator ? `#${profile.discriminator}` : ""}
                      {profile.isBot ? " · bot" : ""}
                      {profile.isSystem ? " · system" : ""}
                    </p>
                  ) : null}
                  {profile?.serverTag ? (
                    <p className="mt-1 inline-flex rounded-md border border-white/15 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-neutral-200">
                      {profile.serverTag}
                    </p>
                  ) : null}
                </div>
              </div>

              {profile && profile.badges.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5" aria-label="Public badges">
                  {profile.badges.map((badge) => (
                    <li
                      key={badge.key}
                      className={
                        badge.key === "spammer"
                          ? "rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-200"
                          : "rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-neutral-300"
                      }
                    >
                      {badge.label}
                    </li>
                  ))}
                </ul>
              ) : null}

              <dl>
                <DataRow label="User ID" value={result.id} />
                <DataRow label="Created" value={formatDate(result.createdAt)} />
                <DataRow label="Account age" value={`${formatNumber(result.accountAgeDays)} days`} />
                <DataRow
                  label="Data source"
                  value={
                    result.dataSource === "discord"
                      ? "Discord API (bot token)"
                      : result.dataSource === "japi"
                        ? "Public profile mirror (japi.rest)"
                        : "Snowflake ID (offline)"
                  }
                  mono={false}
                />
                {profile ? <DataRow label="Display name" value={profile.globalName ?? "Not set"} mono={false} /> : null}
                {profile ? <DataRow label="Banner" value={profile.bannerUrl ? "Custom banner" : profile.accentColor ?? "None"} /> : null}
              </dl>
            </div>
          </Card>

          <RiskPanel risk={result.risk} title="Account signals" />
        </Reveal>
      ) : null}
    </div>
  );
}
