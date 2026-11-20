import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appName = "Jusi Neovim";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(root, "dist", "electron", "main.js");

function run(command) {
  const devProfile = join(root, ".local", "electron-dev-profile");
  const child = spawn(command, [entry, `--user-data-dir=${devProfile}`], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

function patchPlist(plist) {
  const plistBuddy = "/usr/libexec/PlistBuddy";
  if (!existsSync(plistBuddy)) {
    return;
  }
  const commands = [
    ["Set", ":CFBundleName", "Electron"],
    ["Set", ":CFBundleDisplayName", appName],
  ];
  for (const [verb, key, value] of commands) {
    const result = spawnSync(plistBuddy, ["-c", `${verb} ${key} ${value}`, plist], {
      stdio: "ignore",
    });
    if (result.status !== 0) {
      spawnSync(plistBuddy, ["-c", `Add ${key} string ${value}`, plist], {
        stdio: "ignore",
      });
    }
  }
}

if (process.platform === "darwin") {
  const electronApp = join(root, "node_modules", "electron", "dist", "Electron.app");
  const electronBin = join(root, "node_modules", ".bin", "electron");
  if (!existsSync(electronApp) || !existsSync(electronBin)) {
    throw new Error("Local Electron.app is missing. Run `npm install --include=dev` first.");
  }
  patchPlist(join(electronApp, "Contents", "Info.plist"));
  run(electronBin);
} else {
  run(join(root, "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron"));
}
