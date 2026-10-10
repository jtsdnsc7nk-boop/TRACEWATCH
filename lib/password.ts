import type { RiskAssessment } from "@/lib/types";
import { levelForScore } from "@/lib/risk";

export async function sha1Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Finds how many times a hash suffix appears in a "SUFFIX:COUNT" range response. */
export function countInRange(range: string, suffix: string): number {
  for (const line of range.split("\n")) {
    const [candidate, count] = line.trim().split(":");
    if (candidate === suffix) return Number.parseInt(count, 10) || 0;
  }
  return 0;
}

export interface PasswordStrength {
  entropyBits: number;
  label: string;
  issues: string[];
}

export function estimateStrength(password: string): PasswordStrength {
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/\d/.test(password)) pool += 10;
  if (/[^a-zA-Z\d]/.test(password)) pool += 33;

  const issues: string[] = [];
  let effectiveLength = password.length;
  if (/(.)\1{2,}/.test(password)) {
    issues.push("Contains repeated characters.");
    effectiveLength -= 2;
  }
  if (/(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf|zxcv)/i.test(password)) {
    issues.push("Contains a keyboard or number sequence.");
    effectiveLength -= 3;
  }
  if (/(?:19|20)\d{2}/.test(password)) {
    issues.push("Contains what looks like a year.");
    effectiveLength -= 2;
  }
  if (password.length < 12) issues.push("Shorter than 12 characters.");

  const entropyBits = pool > 0 ? Math.max(0, Math.round(Math.max(effectiveLength, 1) * Math.log2(pool))) : 0;
  const label =
    entropyBits < 40 ? "Very weak" : entropyBits < 60 ? "Weak" : entropyBits < 80 ? "Reasonable" : entropyBits < 100 ? "Strong" : "Very strong";
  return { entropyBits, label, issues };
}

export function assessPassword(pwnedCount: number, strength: PasswordStrength): RiskAssessment {
  const factors: string[] = [];
  const recommendations: string[] = [];
  let score: number;

  if (pwnedCount > 0) {
    score = pwnedCount >= 1000 ? 100 : pwnedCount >= 10 ? 92 : 85;
    factors.push(
      `This password appears ${new Intl.NumberFormat("en-US").format(pwnedCount)} time${pwnedCount === 1 ? "" : "s"} in known breach corpora and is in attacker wordlists.`,
    );
    recommendations.push("Stop using this password everywhere, immediately.");
  } else {
    score = strength.entropyBits >= 80 ? 0 : strength.entropyBits >= 60 ? 15 : strength.entropyBits >= 40 ? 40 : 65;
    factors.push("Not found in the Pwned Passwords corpus.");
  }

  factors.push(`Estimated strength: ${strength.label} (~${strength.entropyBits} bits).`);
  factors.push(...strength.issues);
  if (score > 0) {
    recommendations.push("Use a password manager to generate a random password of 16+ characters.");
  }
  recommendations.push("Never reuse a password across services, and enable multi-factor authentication.");

  return { score, level: levelForScore(score), factors, recommendations };
}
