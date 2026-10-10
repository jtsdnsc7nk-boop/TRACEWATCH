#!/usr/bin/env node
// TraceWatch launcher: installs, builds and starts a production instance on any OS.
//   node scripts/tracewatch.mjs [start|update|cli] [--port 3000] [--host 127.0.0.1] [--rebuild] [--no-open]
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IS_WINDOWS = process.platform === "win32";
const NPM = IS_WINDOWS ? "npm.cmd" : "npm";
const STAMP = path.join(ROOT, ".next", "tracewatch-build.json");

const args = process.argv.slice(2);
const VALUE_OPTIONS = new Set(["--port", "--host"]);
// The command is the first bare word that is not the value of a --port/--host option.
const command = args.find((arg, index) => !arg.startsWith("--") && !VALUE_OPTIONS.has(args[index - 1])) ?? "start";
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const port = option("port", process.env.PORT ?? "3000");
// Bound to this machine only by default: TraceWatch is meant to be a private, local tool.
const host = option("host", process.env.HOST ?? "127.0.0.1");

const log = (message) => console.log(`\x1b[1m[tracewatch]\x1b[0m ${message}`);
const fatal = (message) => {
  console.error(`\x1b[31m[tracewatch] ${message}\x1b[0m`);
  process.exit(1);
};

function run(cmd, cmdArgs) {
  // npm.cmd is a batch file, which Windows only runs through a shell.
  const result = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit", shell: IS_WINDOWS });
  if (result.status !== 0) fatal(`"${cmd} ${cmdArgs.join(" ")}" failed.`);
}

function hashFile(file) {
  return existsSync(file) ? createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 16) : "none";
}

function gitHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function buildFingerprint() {
  const version = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  return { version, head: gitHead(), lock: hashFile(path.join(ROOT, "package-lock.json")) };
}

function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) fatal(`Node.js 20 or newer is required (found ${process.versions.node}). Get it from https://nodejs.org`);
}

function update() {
  if (!existsSync(path.join(ROOT, ".git"))) {
    fatal("This folder is not a git clone. Download the latest release from GitHub, or clone the repository.");
  }
  log("Pulling the latest version from GitHub...");
  run("git", ["pull", "--ff-only"]);
}

function ensureInstalled() {
  const lockHash = hashFile(path.join(ROOT, "package-lock.json"));
  const marker = path.join(ROOT, "node_modules", ".tracewatch-lock");
  if (existsSync(marker) && readFileSync(marker, "utf8") === lockHash) return;
  log("Installing dependencies (first run or after an update)...");
  run(NPM, ["ci", "--no-audit", "--no-fund"]);
  writeFileSync(marker, lockHash);
}

function ensureEnvFile() {
  const env = path.join(ROOT, ".env.local");
  if (!existsSync(env)) {
    copyFileSync(path.join(ROOT, ".env.example"), env);
    log("Created .env.local from .env.example (all keys are optional).");
  }
}

function ensureBuilt() {
  const fingerprint = JSON.stringify(buildFingerprint());
  const current = existsSync(STAMP) ? readFileSync(STAMP, "utf8") : "";
  if (!flag("rebuild") && current === fingerprint && existsSync(path.join(ROOT, ".next", "BUILD_ID"))) return;
  log("Building TraceWatch (takes a minute the first time)...");
  run(NPM, ["run", "build"]);
  writeFileSync(STAMP, fingerprint);
}

function openBrowser(url) {
  if (flag("no-open")) return;
  const opener = IS_WINDOWS
    ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin"
      ? ["open", [url]]
      : ["xdg-open", [url]];
  try {
    spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).unref();
  } catch {
    // No desktop browser available (server, container): the URL is printed below.
  }
}

async function waitUntilReady(url, child) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) return false;
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return true;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function start() {
  ensureEnvFile();
  ensureInstalled();
  ensureBuilt();

  const displayHost = host === "0.0.0.0" || host === "::" ? "localhost" : host;
  const url = `http://${displayHost}:${port}`;
  log(`Starting on ${url} ...`);
  const child = spawn(NPM, ["run", "start", "--", "-p", port, "-H", host], {
    cwd: ROOT,
    stdio: "inherit",
    shell: IS_WINDOWS,
    // TRACEWATCH_HOST tells the server whether it is private to this machine (see lib/server/terminal.ts).
    env: { ...process.env, NODE_ENV: "production", TRACEWATCH_HOST: host },
  });
  const forward = (signal) => child.kill(signal);
  process.on("SIGINT", forward);
  process.on("SIGTERM", forward);
  child.on("exit", (code) => process.exit(code ?? 0));

  if (await waitUntilReady(url, child)) {
    log(`TraceWatch is running at ${url}  (press Ctrl+C to stop)`);
    openBrowser(url);
  }
}

checkNode();
if (command === "update") {
  update();
  await start();
} else if (command === "start") {
  await start();
} else if (command === "cli") {
  // Hand the terminal over to the CLI; it connects to (or starts) the server on the chosen port.
  const cli = spawn(process.execPath, [path.join(ROOT, "scripts", "tracewatch-cli.mjs"), "--url", `http://127.0.0.1:${port}`], {
    cwd: ROOT,
    stdio: "inherit",
  });
  cli.on("exit", (code) => process.exit(code ?? 0));
} else {
  fatal(`Unknown command "${command}". Use "start", "update" or "cli".`);
}
