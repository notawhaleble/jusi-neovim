import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
const packaged = process.argv[2] === "--package";
if (process.argv.length > 2 && (!packaged || process.argv.length !== 4)) throw new Error("Usage: run-smoke-electron.mjs [--package executable]");
const scratch = mkdtempSync(join(tmpdir(), "jusi-electron-check-"));
const artifacts = (process.env.JUSI_TEST_EXTRACTION_ONLY === "1" || process.env.JUSI_TEST_ALPHA_TIMING === "1" || process.env.JUSI_TEST_ALPHA_WORKFLOW === "1") ? [] : process.env.JUSI_TEST_NATIVE_POPUPS === "1" ? ["native-popup.png", "native-popup-sandbox.json"]
  : process.env.JUSI_TEST_ADOPTION_ONLY === "1" ? ["adoption-sandbox.json", "adoption.png"]
  : packaged ? ["packaged-sandbox.json", "packaged-presentation.png", "packaged-adoption.png"]
  : ["development-sandbox.json", "presentation.png", "adoption.png"];
for (const name of artifacts) {
  rmSync(join(".local/review", name), { force: true });
}
const electron = packaged ? resolve(process.argv[3]) : createRequire(import.meta.url)("electron");
// Synthetic named buffers must not share swap files with earlier interrupted runs.
const nvimState = join(scratch, "nvim-state");
const child = spawn(electron, packaged ? [] : ["scripts/smoke-electron.mjs"], {
  stdio: "inherit", env: { ...process.env, XDG_STATE_HOME: nvimState, JUSI_TEST_PROFILE_ROOT: scratch, JUSI_TEST_MARKDOWN_PACKAGE: resolve("packages/jusi-markdown.nvim"), JUSI_TEST_NODE_PATH: process.execPath, JUSI_TEST_EXPECT_PACKAGED: packaged ? "1" : "0" },
});
const timeout = setTimeout(() => child.kill("SIGKILL"), process.env.JUSI_TEST_REVIEW ? 600000 : process.env.JUSI_TEST_BROWSER_FULLSCREEN_ONLY === '1' ? 105000 : process.env.JUSI_TEST_MANUAL === "1" ? 200000 : process.env.JUSI_TEST_ALPHA_TIMING === "1" ? 135000 : 45000);
const finish = code => {
  clearTimeout(timeout);
  rmSync(scratch, { recursive: true, force: true });
  process.exitCode = code;
};
child.once("error", error => { console.error(error); finish(1); });
child.once("exit", (code, signal) => finish(signal ? 1 : code ?? 1));
