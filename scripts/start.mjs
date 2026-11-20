#!/usr/bin/env node
// One command to run Context Save from a fresh clone: `npm start`.
// Checks prerequisites, installs dependencies on first run, then launches the app.
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";

const isWin = process.platform === "win32";
const run = (cmd, args) => spawnSync(cmd, args, { stdio: "inherit", shell: isWin });
const has = (cmd) => {
  const r = spawnSync(cmd, ["--version"], { stdio: "ignore", shell: isWin });
  return !r.error && r.status === 0;
};
const fail = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) fail(`Node 22.13 or newer is needed (you have ${process.versions.node}). Install with: winget install OpenJS.NodeJS.LTS`);
if (!isWin) console.warn("⚠ Context Save targets Windows. It will start here, but saving and restoring windows needs Windows.");
if (!has("cargo")) fail("Rust is needed to build the desktop shell. Install with: winget install Rustlang.Rustup  (then restart the terminal)");

const lock = "node_modules/.package-lock.json";
if (!existsSync(lock) || statSync("package-lock.json").mtimeMs > statSync(lock).mtimeMs) {
  console.log("→ Installing dependencies (first run only)…");
  if (run("npm", ["install", "--no-fund", "--no-audit"]).status !== 0) fail("npm install failed. See the output above.");
}

console.log("→ Starting Context Save (the first build of the Rust side takes a few minutes)…");
process.exit(run("npx", ["tauri", "dev"]).status ?? 0);
