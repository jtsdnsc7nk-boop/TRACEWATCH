import { PhoneNumberFormat, PhoneNumberType, PhoneNumberUtil } from "google-libphonenumber";
import type { PhoneScanResult, RiskAssessment } from "@/lib/types";
import { levelForScore } from "@/lib/risk";

const phoneUtil = PhoneNumberUtil.getInstance();

const LINE_TYPES: Record<number, string> = {
  [PhoneNumberType.FIXED_LINE]: "Fixed line",
  [PhoneNumberType.MOBILE]: "Mobile",
  [PhoneNumberType.FIXED_LINE_OR_MOBILE]: "Fixed line or mobile",
  [PhoneNumberType.TOLL_FREE]: "Toll-free",
  [PhoneNumberType.PREMIUM_RATE]: "Premium rate",
  [PhoneNumberType.SHARED_COST]: "Shared cost",
  [PhoneNumberType.VOIP]: "VoIP",
  [PhoneNumberType.PERSONAL_NUMBER]: "Personal number",
  [PhoneNumberType.PAGER]: "Pager",
  [PhoneNumberType.UAN]: "Universal access number",
  [PhoneNumberType.VOICEMAIL]: "Voicemail",
  [PhoneNumberType.UNKNOWN]: "Unknown",
};

export function isSupportedRegion(region: string): boolean {
  return (phoneUtil.getSupportedRegions() as string[]).includes(region);
}

function countryName(region: string | null): string | null {
  if (!region) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(region) ?? region;
  } catch {
    return region;
  }
}

function assess(valid: boolean, possible: boolean, type: number): RiskAssessment {
  const factors: string[] = [];
  const recommendations: string[] = [];
  let score = 0;

  if (!valid) {
    score = possible ? 35 : 55;
    factors.push(
      possible
        ? "The number has a plausible length but does not match any assigned range for its region."
        : "The number is not a possible phone number for its region.",
    );
    recommendations.push("Treat messages or calls claiming to come from this number as spoofed or mistyped.");
  } else if (type === PhoneNumberType.PREMIUM_RATE) {
    score = 80;
    factors.push("Premium-rate number: calling or texting it incurs elevated charges.");
    recommendations.push("Do not call back missed calls from this number; this is a common callback scam pattern.");
  } else if (type === PhoneNumberType.VOIP) {
    score = 45;
    factors.push("VoIP number: cheap to register in bulk and frequently used for disposable identities.");
    recommendations.push("Do not rely on this number alone to verify someone's identity or location.");
  } else if (type === PhoneNumberType.SHARED_COST || type === PhoneNumberType.UAN) {
    score = 30;
    factors.push("Non-geographic business number: the caller's real location cannot be inferred.");
  } else if (type === PhoneNumberType.TOLL_FREE) {
    score = 20;
    factors.push("Toll-free number: commonly legitimate, but also widely used by tech-support scams.");
    recommendations.push("Confirm the number on the organisation's official website before sharing information.");
  } else if (type === PhoneNumberType.MOBILE || type === PhoneNumberType.FIXED_LINE_OR_MOBILE) {
    score = 10;
    factors.push("Mobile-capable number: valid for SMS-based account recovery, which makes it a SIM-swap target.");
    recommendations.push("If this is your number, set a carrier port-out PIN and prefer app-based MFA over SMS.");
  } else {
    score = 5;
    factors.push("The number is valid and matches an assigned range for its region.");
  }

  if (valid) {
    recommendations.push("Caller ID can be spoofed: a valid number does not prove who is calling.");
  }

  return { score, level: levelForScore(score), factors, recommendations };
}

export function analysePhone(input: string, defaultRegion: string | null): PhoneScanResult | null {
  let parsed;
  try {
    parsed = phoneUtil.parseAndKeepRawInput(input, defaultRegion ?? undefined);
  } catch {
    return null;
  }

  const valid = phoneUtil.isValidNumber(parsed);
  const possible = phoneUtil.isPossibleNumber(parsed);
  const region = phoneUtil.getRegionCodeForNumber(parsed) ?? null;
  const type = phoneUtil.getNumberType(parsed);

  return {
    input,
    valid,
    possible,
    region,
    countryName: countryName(region),
    countryCallingCode: parsed.getCountryCode() ?? null,
    nationalNumber: parsed.getNationalNumber()?.toString() ?? null,
    lineType: LINE_TYPES[type] ?? "Unknown",
    formats: possible
      ? {
          e164: phoneUtil.format(parsed, PhoneNumberFormat.E164),
          international: phoneUtil.format(parsed, PhoneNumberFormat.INTERNATIONAL),
          national: phoneUtil.format(parsed, PhoneNumberFormat.NATIONAL),
          rfc3966: phoneUtil.format(parsed, PhoneNumberFormat.RFC3966),
        }
      : null,
    risk: assess(valid, possible, type),
  };
}
