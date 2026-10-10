import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const CLI_SCRIPT = path.join(process.cwd(), "scripts", "tracewatch-cli.mjs");
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export type LaunchResult = { launched: true; terminal: string } | { launched: false; reason: string };

/**
 * The button may only open a window on the machine TraceWatch runs on: refused when the server was
 * started for the network (TRACEWATCH_HOST set to a non-loopback address) or when the CLI is absent
 * (for example inside the Docker image).
 */
export function cliLaunchAvailable(): { ok: true } | { ok: false; reason: string } {
  if (process.env.TRACEWATCH_DISABLE_CLI_LAUNCH === "1") return { ok: false, reason: "Launching the CLI is disabled on this server." };
  const host = process.env.TRACEWATCH_HOST;
  if (host && !LOOPBACK.has(host)) return { ok: false, reason: "This server is shared on the network, so it will not open windows on its host." };
  if (!existsSync(CLI_SCRIPT)) return { ok: false, reason: "The CLI is not included in this installation." };
  return { ok: true };
}

function onPath(binary: string): boolean {
  return spawnSync("sh", ["-c", `command -v ${binary}`], { stdio: "ignore" }).status === 0;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Spawns a detached process and reports failure if it cannot be started at all. */
function launchDetached(command: string, args: string[], options: { windowsVerbatimArguments?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { detached: true, stdio: "ignore", cwd: process.cwd(), ...options });
      let settled = false;
      child.once("error", () => {
        settled = true;
        resolve(false);
      });
      setTimeout(() => {
        if (!settled) {
          child.unref();
          resolve(true);
        }
      }, 400);
    } catch {
      resolve(false);
    }
  });
}

// Linux terminal emulators and how each one takes a command to run.
const LINUX_TERMINALS: { bin: string; args: (cmd: string[]) => string[] }[] = [
  { bin: "konsole", args: (cmd) => ["-e", ...cmd] },
  { bin: "gnome-terminal", args: (cmd) => ["--", ...cmd] },
  { bin: "kgx", args: (cmd) => ["--", ...cmd] },
  { bin: "xfce4-terminal", args: (cmd) => ["-x", ...cmd] },
  { bin: "kitty", args: (cmd) => cmd },
  { bin: "alacritty", args: (cmd) => ["-e", ...cmd] },
  { bin: "wezterm", args: (cmd) => ["start", "--", ...cmd] },
  { bin: "foot", args: (cmd) => cmd },
  { bin: "tilix", args: (cmd) => ["-e", cmd.map(shellQuote).join(" ")] },
  { bin: "x-terminal-emulator", args: (cmd) => ["-e", ...cmd] },
  { bin: "xterm", args: (cmd) => ["-e", ...cmd] },
];

export async function launchCliTerminal(serverUrl: string): Promise<LaunchResult> {
  const availability = cliLaunchAvailable();
  if (!availability.ok) return { launched: false, reason: availability.reason };
  // The URL is passed to a new process; only exact loopback origins are ever accepted.
  if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/.test(serverUrl)) {
    return { launched: false, reason: "Unexpected server address." };
  }
  const command = [process.execPath, CLI_SCRIPT, "--url", serverUrl];

  if (process.platform === "win32") {
    const line = `start "TraceWatch CLI" "${process.execPath}" "${CLI_SCRIPT}" --url ${serverUrl}`;
    const ok = await launchDetached("cmd.exe", ["/d", "/s", "/c", `"${line}"`], { windowsVerbatimArguments: true });
    return ok ? { launched: true, terminal: "Command Prompt" } : { launched: false, reason: "Could not open a terminal window." };
  }

  if (process.platform === "darwin") {
    const shellLine = command.map(shellQuote).join(" ");
    const script = `tell application "Terminal" to do script "${shellLine.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    const ok = await launchDetached("osascript", ["-e", script, "-e", 'tell application "Terminal" to activate']);
    return ok ? { launched: true, terminal: "Terminal" } : { launched: false, reason: "Could not open Terminal." };
  }

  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return { launched: false, reason: "No desktop session is available to open a window in." };
  }
  const preferred = process.env.TERMINAL?.trim();
  const candidates = [
    ...(preferred && /^[\w.-]+$/.test(preferred) ? [{ bin: preferred, args: (cmd: string[]) => ["-e", ...cmd] }] : []),
    ...LINUX_TERMINALS,
  ];
  for (const terminal of candidates) {
    if (!onPath(terminal.bin)) continue;
    if (await launchDetached(terminal.bin, terminal.args(command))) return { launched: true, terminal: terminal.bin };
  }
  return { launched: false, reason: "No supported terminal emulator was found." };
}
