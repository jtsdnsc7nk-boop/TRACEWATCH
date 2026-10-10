#!/usr/bin/env node
// TraceWatch CLI: the scanners of the web app, in your terminal.
//
//   node scripts/tracewatch-cli.mjs                 interactive menu
//   node scripts/tracewatch-cli.mjs email a@b.com   one-off scan (also: username, phone, discord, breaches)
//   options: --url http://127.0.0.1:3000   --no-anim   --no-color
//
// It talks to a running TraceWatch server (starting one if needed), stores nothing, and wipes the
// terminal screen and scrollback when you quit.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ART = JSON.parse(readFileSync(path.join(ROOT, "lib", "ascii-art.json"), "utf8"));
const VERSION = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version;

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const optionValue = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
};
const positional = argv.filter((arg, index) => !arg.startsWith("--") && argv[index - 1] !== "--url");

const out = process.stdout;
const interactive = Boolean(process.stdin.isTTY && out.isTTY);
const useColor = out.isTTY && !hasFlag("no-color") && !process.env.NO_COLOR;
const animate = interactive && !hasFlag("no-anim");
const baseUrl = (optionValue("url") || process.env.TRACEWATCH_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");

// ---------- styling ----------

const sgr = (code) => (text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const bold = sgr("1");
const grey = (level) => sgr(`38;5;${level}`);
const white = grey(255);
const muted = grey(245);
const faint = grey(240);
const red = sgr("38;5;210");
const amber = sgr("38;5;221");
const lime = sgr("38;5;156");
const inverse = sgr("7");

const RISK_COLORS = { none: white, low: lime, moderate: amber, high: sgr("38;5;215"), critical: red };
const RISK_LABELS = { none: "CLEAR", low: "LOW", moderate: "MODERATE", high: "HIGH", critical: "CRITICAL" };

const width = () => Math.min(out.columns || 80, 100);
const center = (line, visible = line.length) => " ".repeat(Math.max(0, Math.floor((width() - visible) / 2))) + line;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const write = (text = "") => out.write(`${text}\n`);
const rule = () => write(faint("─".repeat(width())));
const number = (value) => new Intl.NumberFormat("en-US").format(value);
const compact = (value) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);

async function banner() {
  if (interactive) out.write("\x1b[2J\x1b[H");
  write();
  // Top-to-bottom grey ramp gives the logo the same lit-from-above feel as the website orb.
  const ramp = [255, 255, 254, 253, 252, 251, 250, 249, 248, 247, 246, 245, 244, 243, 242, 241, 240];
  for (const [index, line] of ART.logo.entries()) {
    write(center(grey(ramp[Math.min(index, ramp.length - 1)])(line), line.length));
    if (animate) await sleep(18);
  }
  write();
  for (const [index, line] of ART.name.entries()) {
    write(center(bold(grey(255 - index * 2)(line)), line.length));
    if (animate) await sleep(28);
  }
  write();
  const tagline = ART.tagline.toUpperCase().split("").join(" ");
  write(center(faint(tagline), tagline.length));
  write();
}

function riskBar(risk) {
  const size = 24;
  const filled = Math.round((risk.score / 100) * size);
  const color = RISK_COLORS[risk.level] ?? white;
  return `${color("█".repeat(filled))}${faint("░".repeat(size - filled))}  ${bold(color(`${risk.score}/100 ${RISK_LABELS[risk.level] ?? ""}`))}`;
}

function printRisk(risk, title) {
  write();
  write(`  ${muted(title.toUpperCase())}`);
  write(`  ${riskBar(risk)}`);
  for (const factor of risk.factors.slice(0, 6)) write(`  ${faint("•")} ${factor}`);
  if (risk.recommendations.length > 0) {
    write();
    write(`  ${muted("WHAT TO DO")}`);
    for (const item of risk.recommendations.slice(0, 4)) write(`  ${faint("→")} ${item}`);
  }
}

function spinner(label) {
  if (!interactive) {
    write(faint(`  ${label}...`));
    return () => {};
  }
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frame = 0;
  out.write("\x1b[?25l");
  const timer = setInterval(() => out.write(`\r  ${white(frames[frame++ % frames.length])} ${muted(label)}   `), 80);
  return () => {
    clearInterval(timer);
    out.write("\r\x1b[2K\x1b[?25h");
  };
}

// ---------- server connection ----------

async function api(pathname, body) {
  let response;
  try {
    response = await fetch(`${baseUrl}${pathname}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`Could not reach TraceWatch at ${baseUrl}.`);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? `Request failed with HTTP ${response.status}.`);
  return payload;
}

async function serverVersion() {
  try {
    const status = await api("/api/updates");
    return status.current;
  } catch {
    return null;
  }
}

let ownedServer = null;

async function startServer() {
  const port = new URL(baseUrl).port || "3000";
  ownedServer = spawn(process.execPath, [path.join(ROOT, "scripts", "tracewatch.mjs"), "start", "--no-open", "--port", port], {
    cwd: ROOT,
    stdio: "ignore",
    env: process.env,
  });
  const stop = spinner("Starting TraceWatch (the first start installs and builds, which takes a minute or two)");
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (ownedServer.exitCode !== null) break;
    const version = await serverVersion();
    if (version) {
      stop();
      return version;
    }
    await sleep(500);
  }
  stop();
  return null;
}

async function connect() {
  let version = await serverVersion();
  if (!version) {
    const local = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(baseUrl);
    if (!local) throw new Error(`TraceWatch is not answering at ${baseUrl}.`);
    write(`  ${amber("●")} TraceWatch is not running at ${baseUrl}.`);
    const answer = interactive ? (await ask("Start it now? [Y/n]")) ?? "n" : "y";
    if (answer.trim().toLowerCase().startsWith("n")) throw new Error("No server to talk to. Start one with ./start.sh or start.bat.");
    version = await startServer();
    if (!version) throw new Error("TraceWatch did not start. Run ./start.sh (or start.bat) to see what went wrong.");
  }
  write(`  ${white("●")} ${muted("connected to")} ${white(baseUrl)} ${faint(`· server v${version} · cli v${VERSION}`)}`);
  write();
}

// ---------- keyboard input (raw mode, nothing is kept after you leave) ----------

function readKeys(handler) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk) => {
      const done = (value) => {
        stdin.off("data", onData);
        stdin.setRawMode(false);
        stdin.pause();
        resolve(value);
      };
      handler(chunk, done);
    };
    stdin.on("data", onData);
  });
}

async function readLine() {
  return new Promise((resolve) => {
    let buffer = "";
    process.stdin.setEncoding("utf8");
    const onData = (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline >= 0) {
        process.stdin.off("data", onData);
        process.stdin.pause();
        resolve(buffer.slice(0, newline).replace(/\r$/, ""));
      }
    };
    process.stdin.on("data", onData);
    process.stdin.once("end", () => resolve(buffer || null));
    process.stdin.resume();
  });
}

/** Prompts for a line. Esc cancels (returns null). With mask, typed characters are shown as dots. */
async function ask(label, { mask = false } = {}) {
  out.write(`  ${white("›")} ${label} `);
  if (!interactive) return readLine();
  let value = "";
  return readKeys((chunk, done) => {
    if (chunk === "\u0003") {
      out.write("\n");
      quit();
    }
    if (chunk === "\u001b") {
      out.write(`${faint("cancelled")}\n`);
      return done(null);
    }
    if (chunk.startsWith("\u001b")) return; // arrow keys and other escape sequences
    for (const char of chunk) {
      if (char === "\r" || char === "\n") {
        out.write("\n");
        return done(value);
      }
      if (char === "\u007f" || char === "\b") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          out.write("\b \b");
        }
      } else if (char >= " ") {
        value += char;
        out.write(mask ? "•" : char);
      }
    }
  });
}

async function pause() {
  if (!interactive) return;
  out.write(`\n  ${faint("press any key to return to the menu")}`);
  await readKeys((chunk, done) => {
    if (chunk === "\u0003") quit();
    done();
  });
}

const MENU = [
  { id: "email", label: "Email exposure", hint: "breaches, pastes and infostealer logs" },
  { id: "username", label: "Username search", hint: "public profiles on 42 sites" },
  { id: "password", label: "Password check", hint: "k-anonymity, never leaves this machine" },
  { id: "phone", label: "Phone number", hint: "validity, region and line type" },
  { id: "discord", label: "Discord account", hint: "public profile from a user ID" },
  { id: "breaches", label: "Breach catalogue", hint: "search every known breach" },
  { id: "web", label: "Open the web app", hint: baseUrl },
  { id: "quit", label: "Quit", hint: "wipes this terminal session" },
];

async function menu() {
  write(`  ${muted("WHAT DO YOU WANT TO SEARCH?")}  ${faint("↑/↓ or 1-8, Enter to choose")}`);
  write();
  if (!interactive) {
    MENU.forEach((item, index) => write(`  ${index + 1}. ${item.label}`));
    const answer = await readLine();
    const index = Number.parseInt(answer ?? "", 10) - 1;
    return MENU[index]?.id ?? "quit";
  }

  let selected = 0;
  const render = (first) => {
    if (!first) out.write(`\x1b[${MENU.length}A`);
    MENU.forEach((item, index) => {
      const active = index === selected;
      const label = `${index + 1}  ${item.label.padEnd(18)}`;
      out.write(`\x1b[2K  ${active ? inverse(white(` ${label} `)) : ` ${muted(label)} `} ${active ? muted(item.hint) : faint(item.hint)}\n`);
    });
  };
  out.write("\x1b[?25l");
  render(true);
  const choice = await readKeys((chunk, done) => {
    if (chunk === "\u0003" || chunk === "q") return done("quit");
    if (chunk === "\u001b[A" || chunk === "k") selected = (selected + MENU.length - 1) % MENU.length;
    else if (chunk === "\u001b[B" || chunk === "j") selected = (selected + 1) % MENU.length;
    else if (/^[1-9]$/.test(chunk) && Number(chunk) <= MENU.length) selected = Number(chunk) - 1;
    else if (chunk === "\r" || chunk === "\n") return done(MENU[selected].id);
    else return;
    render(false);
  });
  out.write("\x1b[?25h");
  write();
  return choice;
}

// ---------- scanners ----------

async function scanEmail(value) {
  const email = value ?? (await ask("Email address:"));
  if (!email) return;
  const stop = spinner("Querying breach and infostealer sources");
  let result;
  try {
    result = await api("/api/scan/email", { email });
  } finally {
    stop();
  }
  write(`  ${bold(white(result.email))}`);
  write(
    `  ${result.sources
      .map((source) => `${source.status === "ok" ? white("✓") : source.status === "error" ? red("✗") : faint("–")} ${muted(source.label)}`)
      .join(faint("  ·  "))}`,
  );
  printRisk(result.risk, "Exposure score");
  write();
  write(
    `  ${white(number(result.breaches.length))} ${muted("breaches")}   ${white(number(result.infostealers.length))} ${muted("infostealer hits")}   ${white(number(result.exposedFields.length))} ${muted("data types")}`,
  );
  if (result.infostealers.length > 0) {
    write();
    write(`  ${red("INFOSTEALER MALWARE")} ${muted("saved browser passwords from these devices should be treated as stolen")}`);
    for (const hit of result.infostealers.slice(0, 5)) {
      write(`  ${faint("•")} ${(hit.dateCompromised ?? "unknown date").slice(0, 10)}  ${muted(hit.operatingSystem ?? "unknown system")}  ${faint(`${number(hit.userServices + hit.corporateServices)} logins captured`)}`);
    }
  }
  if (result.breaches.length > 0) {
    write();
    write(`  ${muted("MOST RECENT BREACHES")}`);
    for (const breach of result.breaches.slice(0, 12)) {
      const sensitive = breach.dataClasses.some((type) => /password|credit card|bank|social security/i.test(type));
      write(`  ${sensitive ? red("●") : faint("●")} ${white(breach.title.slice(0, 32).padEnd(32))} ${faint((breach.date ?? "").padEnd(10))} ${muted(breach.dataClasses.slice(0, 4).join(", "))}`);
    }
    if (result.breaches.length > 12) write(`  ${faint(`…and ${number(result.breaches.length - 12)} more in the web app: ${baseUrl}/#email`)}`);
  }
}

async function scanUsername(value) {
  const username = value ?? (await ask("Username:"));
  if (!username) return;
  const stop = spinner("Checking 42 sites in parallel");
  let result;
  try {
    result = await api("/api/scan/username", { username });
  } finally {
    stop();
  }
  write(`  ${bold(white(`@${result.username}`))}  ${muted(`found on ${result.found} of ${result.checked} sites in ${(result.durationMs / 1000).toFixed(1)}s`)}`);
  const found = result.results.filter((item) => item.status === "found");
  const byCategory = new Map();
  for (const item of found) byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
  for (const [category, items] of byCategory) {
    write();
    write(`  ${muted(category.toUpperCase())}`);
    for (const item of items) write(`  ${white("✓")} ${white(item.name.padEnd(28))} ${faint(item.profileUrl)}`);
  }
  const unknown = result.results.filter((item) => item.status === "unknown");
  if (unknown.length > 0) write(`\n  ${amber("?")} ${muted(`could not verify: ${unknown.map((item) => item.name).join(", ")}`)}`);
  write(`\n  ${faint("A matching username is not proof that the accounts belong to the same person.")}`);
}

function estimateBits(password) {
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/\d/.test(password)) pool += 10;
  if (/[^a-zA-Z\d]/.test(password)) pool += 33;
  return pool > 0 ? Math.round(password.length * Math.log2(pool)) : 0;
}

async function scanPassword() {
  if (!interactive) throw new Error("Password checks are interactive only, so the password never lands in your shell history.");
  let password = await ask("Password (hidden):", { mask: true });
  if (!password) return;
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const bits = estimateBits(password);
  password = "";
  const stop = spinner("Checking the hash prefix against Pwned Passwords");
  let range;
  try {
    ({ range } = await api("/api/scan/password", { prefix: hash.slice(0, 5) }));
  } finally {
    stop();
  }
  const line = range.split("\n").find((entry) => entry.split(":")[0] === hash.slice(5));
  const count = line ? Number.parseInt(line.split(":")[1], 10) : 0;
  write(`  ${muted("only this was sent:")} ${white(hash.slice(0, 5))}${faint(" (5 of 40 hash characters)")}`);
  write();
  if (count > 0) {
    write(`  ${red("✗")} ${bold(red(`Seen ${number(count)} times in breaches.`))} ${muted("Stop using this password everywhere.")}`);
  } else {
    write(`  ${white("✓")} ${bold(white("Not found in any known breach."))}`);
  }
  const strength = bits < 40 ? red("very weak") : bits < 60 ? amber("weak") : bits < 80 ? lime("reasonable") : white("strong");
  write(`  ${faint("•")} ${muted("estimated strength:")} ${strength} ${faint(`(~${bits} bits)`)}`);
}

async function scanPhone(value) {
  const phone = value ?? (await ask("Phone number (with +country code):"));
  if (!phone) return;
  const result = await api("/api/scan/phone", { phone });
  const rows = [
    ["Valid", result.valid ? "yes" : "no"],
    ["Country", result.countryName ? `${result.countryName} (${result.region})` : "unknown"],
    ["Line type", result.lineType],
    ["International", result.formats?.international ?? "-"],
    ["E.164", result.formats?.e164 ?? "-"],
  ];
  for (const [label, text] of rows) write(`  ${muted(label.padEnd(14))} ${white(text)}`);
  printRisk(result.risk, "Number risk");
}

async function scanDiscord(value) {
  const id = value ?? (await ask("Discord user ID:"));
  if (!id) return;
  const stop = spinner("Looking up the public profile");
  let result;
  try {
    result = await api("/api/scan/discord", { id: id.trim() });
  } finally {
    stop();
  }
  const profile = result.profile;
  if (profile) {
    write(`  ${bold(white(profile.globalName ?? profile.username))} ${muted(`@${profile.username}${profile.discriminator ? `#${profile.discriminator}` : ""}`)}${profile.isBot ? amber("  BOT") : ""}`);
    if (profile.serverTag) write(`  ${muted("server tag")} ${white(profile.serverTag)}`);
    if (profile.badges.length > 0) write(`  ${muted("badges")} ${profile.badges.map((badge) => (badge.key === "spammer" ? red(badge.label) : white(badge.label))).join(faint(", "))}`);
  } else {
    write(`  ${muted(result.live ? "No Discord user has this ID." : "Profile unavailable; showing what the ID itself reveals.")}`);
  }
  write(`  ${muted("created".padEnd(10))} ${white(result.createdAt.slice(0, 10))}  ${faint(`${number(result.accountAgeDays)} days ago`)}`);
  printRisk(result.risk, "Account signals");
}

async function searchBreaches(value) {
  const query = value ?? (await ask("Search breaches (name, domain or data type):"));
  if (query === null || query === undefined) return;
  const result = await api(`/api/breaches?${new URLSearchParams({ q: query, sort: "size", limit: "15" })}`);
  write(`  ${white(number(result.matching))} ${muted(`of ${number(result.total)} breaches match, largest first`)}`);
  write();
  for (const breach of result.breaches) {
    write(`  ${white(breach.title.slice(0, 34).padEnd(34))} ${muted(compact(breach.records ?? 0).padStart(7))} ${faint((breach.date ?? "").padEnd(11))} ${faint(breach.domain ?? "")}`);
  }
}

function openWeb() {
  const opener =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", baseUrl]] : process.platform === "darwin" ? ["open", [baseUrl]] : ["xdg-open", [baseUrl]];
  try {
    spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).unref();
    write(`  ${white("●")} ${muted("opened")} ${white(baseUrl)}`);
  } catch {
    write(`  ${muted("open this in your browser:")} ${white(baseUrl)}`);
  }
}

const ACTIONS = {
  email: scanEmail,
  username: scanUsername,
  password: scanPassword,
  phone: scanPhone,
  discord: scanDiscord,
  breaches: searchBreaches,
  web: async () => openWeb(),
};

// ---------- lifecycle ----------

function quit(code = 0) {
  if (ownedServer && ownedServer.exitCode === null) ownedServer.kill("SIGTERM");
  if (interactive) {
    // Clear the screen and the scrollback so nothing you searched stays readable in this terminal.
    out.write("\x1b[?25h\x1b[2J\x1b[3J\x1b[H");
    write(`  ${white("●")} ${muted("TraceWatch session wiped. Nothing was saved.")}`);
  }
  process.exit(code);
}

async function main() {
  await banner();
  await connect();

  const [command, ...rest] = positional;
  if (command) {
    const action = ACTIONS[command];
    if (!action) throw new Error(`Unknown scan "${command}". Use: email, username, phone, discord or breaches.`);
    rule();
    await action(rest.join(" ") || undefined);
    write();
    if (ownedServer) ownedServer.kill("SIGTERM");
    return;
  }

  for (;;) {
    const choice = await menu();
    if (choice === "quit") quit();
    rule();
    try {
      await ACTIONS[choice]();
    } catch (error) {
      write(`  ${red("✗")} ${error instanceof Error ? error.message : String(error)}`);
    }
    await pause();
    await banner();
    write(`  ${white("●")} ${muted("connected to")} ${white(baseUrl)}`);
    write();
  }
}

process.on("SIGINT", () => quit(130));
main().catch((error) => {
  write(`  ${red("✗")} ${error instanceof Error ? error.message : String(error)}`);
  if (ownedServer && ownedServer.exitCode === null) ownedServer.kill("SIGTERM");
  process.exit(1);
});
