import type { Breach, RiskAssessment, RiskLevel } from "@/lib/types";

const CREDENTIAL_CLASSES = ["password", "auth token", "security question", "pin"];
const FINANCIAL_CLASSES = ["credit card", "bank account", "payment", "financial", "cvv"];
const IDENTITY_CLASSES = [
  "social security",
  "government issued",
  "passport",
  "driver",
  "national id",
  "tax",
  "date of birth",
  "dates of birth",
  "physical address",
];

export function levelForScore(score: number): RiskLevel {
  if (score <= 0) return "none";
  if (score < 25) return "low";
  if (score < 50) return "moderate";
  if (score < 75) return "high";
  return "critical";
}

function hasClass(breach: Breach, needles: string[]): boolean {
  return breach.dataClasses.some((dataClass) => {
    const lower = dataClass.toLowerCase();
    return needles.some((needle) => lower.includes(needle));
  });
}

function breachYear(breach: Breach): number | null {
  if (!breach.date) return null;
  const year = Number.parseInt(breach.date.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

export function assessBreaches(breaches: Breach[], pasteCount: number, infostealerCount = 0): RiskAssessment {
  if (breaches.length === 0 && pasteCount === 0 && infostealerCount === 0) {
    return {
      score: 0,
      level: "none",
      factors: ["No known breach or paste exposure was found for this address."],
      recommendations: [
        "Keep using a unique password per service and enable multi-factor authentication.",
        "Re-check periodically: new breaches are disclosed every week.",
      ],
    };
  }

  const currentYear = new Date().getUTCFullYear();
  const credentialBreaches = breaches.filter((b) => hasClass(b, CREDENTIAL_CLASSES));
  const financialBreaches = breaches.filter((b) => hasClass(b, FINANCIAL_CLASSES));
  const identityBreaches = breaches.filter((b) => hasClass(b, IDENTITY_CLASSES));
  const sensitiveBreaches = breaches.filter((b) => b.sensitive);
  const recentBreaches = breaches.filter((b) => {
    const year = breachYear(b);
    return year !== null && currentYear - year <= 2;
  });

  let score = Math.min(35, breaches.length * 5);
  score += Math.min(25, credentialBreaches.length * 6);
  score += Math.min(15, financialBreaches.length * 8);
  score += Math.min(10, identityBreaches.length * 3);
  score += Math.min(10, recentBreaches.length * 4);
  score += Math.min(5, sensitiveBreaches.length * 5);
  score += Math.min(5, pasteCount * 2);
  score += infostealerCount > 0 ? 35 : 0;
  score = Math.max(1, Math.min(100, Math.round(score)));

  const factors: string[] = [];
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "es"}`;
  if (breaches.length > 0) factors.push(`Found in ${plural(breaches.length, "known breach")}.`);
  if (credentialBreaches.length > 0)
    factors.push(`${plural(credentialBreaches.length, "breach")} exposed passwords or other credentials.`);
  if (financialBreaches.length > 0)
    factors.push(`${plural(financialBreaches.length, "breach")} exposed financial data.`);
  if (identityBreaches.length > 0)
    factors.push(`${plural(identityBreaches.length, "breach")} exposed identity data usable for fraud.`);
  if (recentBreaches.length > 0)
    factors.push(`${plural(recentBreaches.length, "breach")} occurred within the last two years.`);
  if (sensitiveBreaches.length > 0)
    factors.push(`${plural(sensitiveBreaches.length, "breach")} flagged as sensitive by the source.`);
  if (infostealerCount > 0) {
    factors.push(
      `Linked to ${infostealerCount} infostealer-infected device${infostealerCount === 1 ? "" : "s"}: saved browser passwords and session cookies were likely stolen.`,
    );
  }
  if (pasteCount > 0) factors.push(`Address appears in ${pasteCount} public paste${pasteCount === 1 ? "" : "s"}.`);

  const recommendations: string[] = [];
  if (infostealerCount > 0) {
    recommendations.push(
      "Malware-scan or reinstall any device you used around the infection date, then change every password saved in its browser.",
    );
    recommendations.push("Sign out of all sessions on important accounts to invalidate stolen session cookies.");
  }
  if (credentialBreaches.length > 0) {
    recommendations.push(
      "Change the password on every breached service, and anywhere else that password was reused.",
    );
  }
  recommendations.push("Enable multi-factor authentication, preferring an authenticator app or passkey over SMS.");
  if (financialBreaches.length > 0) {
    recommendations.push("Review card and bank statements, and consider replacing exposed cards.");
  }
  if (identityBreaches.length > 0) {
    recommendations.push("Consider a credit freeze or fraud alert with your local credit bureaus.");
  }
  recommendations.push("Expect targeted phishing that references breached services; verify senders before clicking.");
  recommendations.push("Use a password manager to generate a unique password for every account.");

  return { score, level: levelForScore(score), factors, recommendations };
}
