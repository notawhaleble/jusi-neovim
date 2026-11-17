// Build a test-only package. Production builds never include this bootstrap.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const focusOnly = process.argv.length === 3 && process.argv[2] === '--focus-only';
const workflowOnly = process.argv.length === 3 && process.argv[2] === '--workflow-only';
if (process.argv.length > 2 && !focusOnly && !workflowOnly) throw new Error('Usage: smoke-package.mjs [--focus-only|--workflow-only]');
const root = fileURLToPath(new URL("..", import.meta.url));
const output = resolve(root, ".local/review/packaged-smoke");
if (!["darwin", "linux"].includes(process.platform)) throw new Error("Package smoke supports macOS and Linux");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
mkdirSync(output, { recursive: true });
const config = join(output, "builder.json");
writeFileSync(config, JSON.stringify({
  ...manifest.build,
  directories: { ...manifest.build.directories, output: join(output, "build") },
  files: [...manifest.build.files, "scripts/smoke-electron.mjs", "scripts/nvim-integration-cases.mjs", "scripts/nvim-mouse-cases.mjs", "scripts/nvim-overlay-cases.mjs", "scripts/nvim-display-cases.mjs", "scripts/sandbox-evidence.mjs", "scripts/popup-cases.mjs", "scripts/adoption-cases.mjs", "scripts/native-popup-cases.mjs", "scripts/browser-interaction-cases.mjs", "scripts/browser-workflow-cases.mjs", "scripts/alpha-workflow-cases.mjs", "scripts/fixtures/source-viewer/**/*"],
  extraMetadata: { ...manifest.build.extraMetadata, main: "scripts/smoke-electron.mjs" },
}, null, 2));
function run(command, args, extraEnv = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit", env: { ...process.env, ...extraEnv } });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited ${code ?? signal}`)));
  });
}
await run(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"]);
if (process.platform === "linux") await run(process.execPath, ["scripts/prepare-linux-icons.mjs"]);
await run(process.execPath, ["node_modules/electron-builder/cli.js", process.platform === "darwin" ? "--mac" : "--linux", "--dir", "--publish", "never", "--config", config], { CSC_IDENTITY_AUTO_DISCOVERY: "false" });
const platformDir = process.platform === "darwin"
  ? (process.arch === "arm64" ? "mac-arm64" : "mac")
  : (process.arch === "arm64" ? "linux-arm64-unpacked" : "linux-unpacked");
const executable = process.platform === "darwin"
  ? join(output, "build", platformDir, "Jusi Neovim.app", "Contents/MacOS/Jusi Neovim")
  : join(output, "build", platformDir, "jusi-neovim");
if (!focusOnly && !workflowOnly) await run(process.execPath, ["scripts/run-smoke-electron.mjs", "--package", executable]);

if (!workflowOnly) await run(process.execPath, ["scripts/run-smoke-electron.mjs", "--package", executable], { JUSI_TEST_NATIVE_POPUPS: "1", ...(focusOnly ? { JUSI_TEST_FOCUS_ONLY: "1" } : {}) });

// Reuse the same package for the delayed-acknowledgement focus regression.
if (!focusOnly && !workflowOnly) await run(process.execPath, ["scripts/run-smoke-electron.mjs", "--package", executable],
  { JUSI_TEST_NATIVE_POPUPS: "1", JUSI_TEST_FOCUS_ONLY: "1" });

// Exercise the default-adapter everyday workflow in the same test package.
if (!focusOnly) await run(process.execPath, ["scripts/run-smoke-electron.mjs", "--package", executable],
  { JUSI_TEST_ALPHA_WORKFLOW: "1" });

// Current browser workflows through both packaged transports.
if (!focusOnly) for (const native of [false,true]) await run(process.execPath,
  ["scripts/run-smoke-electron.mjs", "--package", executable],
  { JUSI_TEST_BROWSER_WORKFLOW: "1", ...(native ? {JUSI_TEST_NATIVE_POPUPS:"1"} : {}) });
