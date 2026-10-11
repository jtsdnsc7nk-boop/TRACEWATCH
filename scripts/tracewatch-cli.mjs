#!/usr/bin/env node
// TraceWatch CLI: the scanners of the web app, in your terminal.
//
//   node scripts/tracewatch-cli.mjs                 interactive menu
//   node scripts/tracewatch-cli.mjs email a@b.com   one-off scan (also: username, phone, discord, breaches)
//   options: --url http://127.0.0.1:3000   --no-anim   --no-color   (NO_COLOR / NO_MOTION are honoured too)
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
const animate = interactive && !hasFlag("no-anim") && !process.env.NO_MOTION && !process.env.TRACEWATCH_NO_ANIM;
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
// Top-to-bottom grey ramp gives the logo the same lit-from-above feel as the website orb.
const LOGO_RAMP = [255, 255, 254, 253, 252, 251, 250, 249, 248, 247, 246, 245, 244, 243, 242, 241, 240];
const NOISE = "░▒▓▚▞▖▗▘▝▙▟";

const columns = () => out.columns || 80;
const width = () => Math.min(columns(), 100);
// Lines that are redrawn in place must never wrap, or each redraw would land on a new line.
const fit = (text, max) => (max <= 1 ? "" : text.length > max ? `${text.slice(0, max - 1)}…` : text);
const pad = (visible) => " ".repeat(Math.max(0, Math.floor((width() - visible) / 2)));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const number = (value) => new Intl.NumberFormat("en-US").format(value);
const compact = (value) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const hideCursor = () => interactive && out.write("\x1b[?25l");
const showCursor = () => interactive && out.write("\x1b[?25h");

// What is on screen below the header, so a resize can redraw it at the new size. It lives in memory
// only and is dropped on the next screen or when the CLI exits.
const view = { body: [], menu: null, prompt: null, footer: null, intro: false };

// While a scan result is being printed, lines are collected and then cascaded onto the screen.
let captured = null;
const write = (text = "") => {
  if (captured) captured.push(text);
  else {
    out.write(`${text}\n`);
    view.body.push(text);
  }
};
// Dividers are stored as a marker and drawn at the current width, so they never wrap after a resize.
const RULE = "\u0000rule";
const ruleText = () => faint("─".repeat(width()));
const rule = () => {
  if (captured) captured.push(ruleText());
  else {
    out.write(`${ruleText()}\n`);
    view.body.push(RULE);
  }
};

async function flushCaptured() {
  const lines = captured ?? [];
  captured = null;
  for (const line of lines) {
    if (typeof line === "object" && line?.risk) {
      await drawRiskBar(line.risk);
      view.body.push(`  ${riskBarText(line.risk.score, line.risk.level, Math.round((line.risk.score / 100) * riskBarSize()))}`);
      continue;
    }
    out.write(`${line}\n`);
    view.body.push(line);
    if (animate && !resizedDuring) await sleep(7);
  }
}

// ---------- banner animation ----------

const rows = () => out.rows || 24;
// Lines the menu needs below the header: connection line, title, eight items and some breathing room.
const MENU_ROOM = 14;
const SPACED_NAME = "T R A C E W A T C H";

/** Picks the biggest header that fits the window, so nothing scrolls while the intro animates. */
function headerVariant() {
  const full = ART.logo.length + ART.name.length + 6;
  const medium = ART.logo.length + 5;
  if (columns() >= 62 && rows() >= full + MENU_ROOM) return "full";
  if (columns() >= 40 && rows() >= medium + MENU_ROOM) return "logo";
  if (columns() >= 34 && rows() >= 4 + 10) return "mini";
  return "tiny";
}

const nameLines = () => (headerVariant() === "full" ? ART.name : [SPACED_NAME]);

function taglineText() {
  return ART.tagline.toUpperCase().split("").join(" ");
}

/** The static header for small windows: a two-line cat beside the name, or just the name. */
function compactHeader(variant) {
  if (variant === "tiny") return ["", `  ${bold(white("TRACEWATCH"))} ${faint(fit(ART.tagline, columns() - 14))}`, ""];
  const cat = ["▄▄███▄▄", "(=^.^=)"];
  const text = [bold(white(fit(SPACED_NAME, columns() - 12))), faint(fit(ART.tagline, columns() - 12))];
  return ["", `  ${white(cat[0])}  ${text[0]}`, `  ${grey(250)(cat[1])}  ${text[1]}`, ""];
}

function headerLines() {
  const variant = headerVariant();
  if (variant === "mini" || variant === "tiny") return compactHeader(variant);
  const tagline = taglineText();
  return [...bannerLines(), `${pad(tagline.length)}${faint(fit(tagline, columns() - 1))}`, ""];
}

function bannerLines({ revealAt = null, frame = 0, sweep = -1, blink = false, jitter = null } = {}) {
  const logo = ART.logo.map((line, index) =>
    blink && index === ART.blink.row ? ART.blink.lines[0] : blink && index === ART.blink.row + 1 ? ART.blink.lines[1] : line,
  );
  const render = (line, row, color) => {
    if (!revealAt) return color(line);
    // Scramble: each glyph resolves at its own frame; until then it shows a dim noise character.
    let text = "";
    for (let col = 0; col < line.length; col += 1) {
      const char = line[col];
      if (char === " ") text += " ";
      else if (frame >= revealAt(row, col)) text += color(char);
      else text += faint(NOISE[(row * 7 + col * 13 + frame * 5) % NOISE.length]);
    }
    return text;
  };
  const lines = [""];
  logo.forEach((line, row) => {
    const color = row === sweep ? (text) => bold(white(text)) : grey(LOGO_RAMP[Math.min(row, LOGO_RAMP.length - 1)]);
    lines.push(pad(line.length) + render(line, row, color));
  });
  lines.push("");
  nameLines().forEach((line, index) => {
    const shift = jitter ? jitter[index] : 0;
    const color = (text) => bold(grey(255 - index * 2)(text));
    lines.push(" ".repeat(Math.max(0, pad(line.length).length + shift)) + render(line, ART.logo.length + 1 + index, color));
  });
  lines.push("");
  return lines;
}

function paint(lines) {
  out.write("\x1b[H");
  for (const line of lines) out.write(`\x1b[2K${line}\n`);
}

let resizedDuring = false;

async function banner({ intro = false } = {}) {
  view.body = [];
  view.menu = null;
  view.prompt = null;
  view.footer = null;
  if (interactive) out.write("\x1b[2J\x1b[3J\x1b[H");
  const variant = headerVariant();

  if (!animate || !intro || variant === "mini" || variant === "tiny") {
    for (const line of headerLines()) out.write(`${line}\n`);
    return;
  }

  view.intro = true;
  resizedDuring = false;
  hideCursor();
  const step = async (lines, ms) => {
    if (resizedDuring) return false;
    paint(lines);
    await sleep(ms);
    return !resizedDuring;
  };
  run: {
    // 1. Decrypt: glyphs resolve out of noise, top rows slightly earlier than bottom rows.
    const frames = 20;
    const seeds = new Map();
    const revealAt = (row, col) => {
      const key = `${row}:${col}`;
      if (!seeds.has(key)) seeds.set(key, Math.floor(Math.random() * frames * 0.7 + (row / 25) * frames * 0.3));
      return seeds.get(key);
    };
    for (let frame = 0; frame <= frames; frame += 1) if (!(await step(bannerLines({ revealAt, frame }), 38))) break run;
    // 2. A band of light sweeps down the cat, like the rim light on the website orb.
    for (let row = 0; row < ART.logo.length; row += 1) if (!(await step(bannerLines({ sweep: row }), 22))) break run;
    // 3. The name glitches into place.
    for (let i = 0; i < 4; i += 1) {
      if (!(await step(bannerLines({ jitter: nameLines().map(() => Math.round((Math.random() - 0.5) * 4)) }), 45))) break run;
    }
    // 4. The cat blinks.
    if (!(await step(bannerLines(), 120))) break run;
    if (!(await step(bannerLines({ blink: true }), 110))) break run;
    paint(bannerLines());
    // 5. Tagline types itself out.
    const tagline = taglineText();
    out.write(pad(tagline.length));
    for (const char of tagline) {
      if (resizedDuring) break run;
      out.write(faint(char));
      if (char !== " ") await sleep(11);
    }
    out.write("\n\n");
  }
  view.intro = false;
  showCursor();
  // The window changed size mid-animation: finish with the static header at the new size.
  if (resizedDuring) {
    out.write("\x1b[2J\x1b[3J\x1b[H");
    for (const line of headerLines()) out.write(`${line}\n`);
  }
}

/** Redraws the whole current screen for the new window size: header, content, then the live control. */
function redraw() {
  if (!interactive) return;
  out.write("\x1b[2J\x1b[3J\x1b[H");
  for (const line of headerLines()) out.write(`${line}\n`);
  for (const line of view.body) out.write(`${line === RULE ? ruleText() : line}\n`);
  if (view.menu) MENU.forEach((item, index) => out.write(`${menuLine(item, index, index === view.menu.selected)}\n`));
  if (view.prompt) out.write(`${promptPrefix(view.prompt.label)}${view.prompt.mask ? "•".repeat(view.prompt.value.length) : view.prompt.value}`);
  if (view.footer) out.write(`\n  ${faint(view.footer)}`);
}

let resizeTimer = null;
function onResize() {
  if (view.intro) {
    resizedDuring = true;
    return;
  }
  clearTimeout(resizeTimer);
  // Terminals send a burst of resize events while a window is dragged; redraw once it settles.
  resizeTimer = setTimeout(redraw, 70);
}

// ---------- animated status ----------

function spinner(label) {
  if (!interactive) {
    out.write(faint(`  ${label}...\n`));
    return () => {};
  }
  const started = Date.now();
  const bars = "▁▂▃▄▅▆▇█";
  let frame = 0;
  hideCursor();
  const draw = () => {
    let wave = "";
    for (let i = 0; i < 14; i += 1) {
      const level = (Math.sin((i - frame * 0.6) / 1.8) + 1) / 2;
      wave += grey(240 + Math.round(level * 15))(bars[Math.round(level * (bars.length - 1))]);
    }
    const seconds = `${((Date.now() - started) / 1000).toFixed(1)}s`;
    const room = columns() - 2 - 14 - 2 - 1 - seconds.length - 1;
    out.write(`\r\x1b[2K  ${wave}  ${muted(fit(label, room))} ${faint(seconds)}`);
    frame += 1;
  };
  draw();
  const timer = setInterval(draw, animate ? 60 : 250);
  return () => {
    clearInterval(timer);
    out.write("\r\x1b[2K");
    showCursor();
  };
}

const riskBarSize = () => Math.max(8, Math.min(24, columns() - 22));

function riskBarText(score, level, filledCells) {
  const size = riskBarSize();
  const color = RISK_COLORS[level] ?? white;
  return `${color("█".repeat(filledCells))}${faint("░".repeat(size - filledCells))}  ${bold(color(`${score}/100 ${RISK_LABELS[level] ?? ""}`))}`;
}

async function drawRiskBar(risk) {
  const target = Math.round((risk.score / 100) * riskBarSize());
  if (!animate) {
    out.write(`  ${riskBarText(risk.score, risk.level, target)}\n`);
    return;
  }
  hideCursor();
  const steps = 16;
  for (let step = 1; step <= steps; step += 1) {
    const eased = 1 - (1 - step / steps) ** 3;
    out.write(`\r\x1b[2K  ${riskBarText(Math.round(risk.score * eased), risk.level, Math.round(target * eased))}`);
    await sleep(22);
  }
  out.write("\n");
  showCursor();
}

function printRisk(risk, title) {
  write();
  write(`  ${muted(title.toUpperCase())}`);
  write({ risk });
  for (const factor of risk.factors.slice(0, 6)) write(`  ${faint("•")} ${factor}`);
  if (risk.recommendations.length > 0) {
    write();
    write(`  ${muted("WHAT TO DO")}`);
    for (const item of risk.recommendations.slice(0, 4)) write(`  ${faint("→")} ${item}`);
  }
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
  const stop = spinner(`Connecting to ${baseUrl}`);
  let version = await serverVersion();
  if (animate) await sleep(250);
  stop();
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
const promptPrefix = (label) => `  ${white("›")} ${label} `;

async function ask(label, { mask = false } = {}) {
  out.write(promptPrefix(label));
  if (!interactive) return readLine();
  view.prompt = { label, value: "", mask };
  const finish = (value) => {
    view.body.push(`${promptPrefix(label)}${value === null ? faint("cancelled") : mask ? "•".repeat(value.length) : value}`);
    view.prompt = null;
    return value;
  };
  return readKeys((chunk, done) => {
    if (chunk === "\u0003") {
      out.write("\n");
      void quit();
      return;
    }
    if (chunk === "\u001b") {
      out.write(`${faint("cancelled")}\n`);
      return done(finish(null));
    }
    if (chunk.startsWith("\u001b")) return; // arrow keys and other escape sequences
    for (const char of chunk) {
      if (char === "\r" || char === "\n") {
        out.write("\n");
        return done(finish(view.prompt.value));
      }
      if (char === "\u007f" || char === "\b") {
        if (view.prompt.value.length > 0) {
          view.prompt.value = view.prompt.value.slice(0, -1);
          out.write("\b \b");
        }
      } else if (char >= " ") {
        view.prompt.value += char;
        out.write(mask ? "•" : char);
      }
    }
  });
}

async function pause() {
  if (!interactive) return;
  view.footer = "press any key to return to the menu";
  out.write(`\n  ${faint(view.footer)}`);
  await readKeys((chunk, done) => {
    if (chunk === "\u0003") void quit();
    else done();
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

function menuLine(item, index, active) {
  const label = `${index + 1}  ${item.label.padEnd(18)}`;
  const pointer = active ? white("❯") : " ";
  // " ❯ " + " label " + " " takes label.length + 6 columns; the hint gets whatever is left, or nothing.
  const room = columns() - label.length - 7;
  const hint = room >= 12 ? fit(item.hint, room) : "";
  return `\x1b[2K ${pointer} ${active ? inverse(white(` ${label} `)) : ` ${muted(label)} `} ${active ? muted(hint) : faint(hint)}`;
}

async function menu({ cascade = false } = {}) {
  write(`  ${muted("WHAT DO YOU WANT TO SEARCH?")}${columns() >= 62 ? `  ${faint("↑/↓ or 1-8, Enter to choose")}` : ""}`);
  write();
  if (!interactive) {
    MENU.forEach((item, index) => write(`  ${index + 1}. ${item.label}`));
    const answer = await readLine();
    const index = Number.parseInt(answer ?? "", 10) - 1;
    return MENU[index]?.id ?? "quit";
  }

  view.menu = { selected: 0 };
  hideCursor();
  for (const [index, item] of MENU.entries()) {
    out.write(`${menuLine(item, index, index === view.menu.selected)}\n`);
    if (cascade && animate) await sleep(28);
  }
  const redraw = () => {
    out.write(`\x1b[${MENU.length}A`);
    MENU.forEach((item, index) => out.write(`${menuLine(item, index, index === view.menu.selected)}\n`));
  };
  const choice = await readKeys((chunk, done) => {
    if (chunk === "\u0003" || chunk === "q") return done("quit");
    const menuState = view.menu;
    if (chunk === "\u001b[A" || chunk === "k") menuState.selected = (menuState.selected + MENU.length - 1) % MENU.length;
    else if (chunk === "\u001b[B" || chunk === "j") menuState.selected = (menuState.selected + 1) % MENU.length;
    else if (/^[1-9]$/.test(chunk) && Number(chunk) <= MENU.length) menuState.selected = Number(chunk) - 1;
    else if (chunk === "\r" || chunk === "\n") return done(MENU[menuState.selected].id);
    else return;
    redraw();
  });
  view.menu = null;
  showCursor();
  out.write("\n");
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

/** Runs a scanner, collecting its output so it can cascade onto the screen in one smooth pass. */
async function runAction(id, value) {
  captured = [];
  try {
    await ACTIONS[id](value);
  } catch (error) {
    write(`  ${red("✗")} ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await flushCaptured();
  }
}

// ---------- lifecycle ----------

let quitting = false;

async function quit(code = 0) {
  if (quitting) return;
  quitting = true;
  if (ownedServer && ownedServer.exitCode === null) ownedServer.kill("SIGTERM");
  if (interactive) {
    if (animate) {
      // Wipe animation: a shaded curtain falls over the screen before it is erased for real.
      hideCursor();
      const rows = Math.min(out.rows || 30, 60);
      const cols = out.columns || 80;
      out.write("\x1b[H");
      for (let row = 0; row < rows; row += 1) {
        const shade = "░▒▓█"[Math.min(3, Math.floor((row / rows) * 4))];
        out.write(`\x1b[2K${grey(236 + Math.min(4, Math.floor((row / rows) * 5)))(shade.repeat(cols))}\n`);
        await sleep(6);
      }
      await sleep(60);
    }
    // Clear the screen and the scrollback so nothing you searched stays readable in this terminal.
    out.write("\x1b[2J\x1b[3J\x1b[H");
    showCursor();
    const message = "TraceWatch session wiped. Nothing was saved.";
    out.write(`  ${white("●")} `);
    for (const char of message) {
      out.write(muted(char));
      if (animate) await sleep(9);
    }
    out.write("\n");
  }
  process.exit(code);
}

async function main() {
  await banner({ intro: true });
  await connect();

  const [command, ...rest] = positional;
  if (command) {
    if (!ACTIONS[command]) throw new Error(`Unknown scan "${command}". Use: email, username, phone, discord or breaches.`);
    rule();
    await runAction(command, rest.join(" ") || undefined);
    write();
    if (ownedServer) ownedServer.kill("SIGTERM");
    return;
  }

  let first = true;
  for (;;) {
    const choice = await menu({ cascade: first });
    first = false;
    if (choice === "quit") await quit();
    rule();
    await runAction(choice);
    await pause();
    await banner();
    write(`  ${white("●")} ${muted("connected to")} ${white(baseUrl)}`);
    write();
  }
}

process.on("SIGINT", () => void quit(130));
if (interactive) out.on("resize", onResize);
main().catch((error) => {
  showCursor();
  out.write(`  ${red("✗")} ${error instanceof Error ? error.message : String(error)}\n`);
  if (ownedServer && ownedServer.exitCode === null) ownedServer.kill("SIGTERM");
  process.exit(1);
});
