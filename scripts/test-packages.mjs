import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const lazyRevision = "85c7ff3711b730b4030d03144f6db6375044ae82";
const lazy = join(root, ".local/test-tools/lazy.nvim");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 60_000, ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error ?? result.stderr}\n${result.stdout ?? ""}`);
  return result.stdout;
}
const nativeOnly = process.argv.includes("--native-only");
if (!nativeOnly) {
  if (!existsSync(join(lazy, ".git"))) {
    mkdirSync(lazy, { recursive: true });
    run("git", ["init", "--quiet", lazy]);
    run("git", ["-C", lazy, "remote", "add", "origin", "https://github.com/folke/lazy.nvim.git"]);
    run("git", ["-C", lazy, "fetch", "--depth=1", "origin", lazyRevision]);
    run("git", ["-C", lazy, "checkout", "--detach", "FETCH_HEAD"]);
  }
  if (run("git", ["-C", lazy, "rev-parse", "HEAD"]).trim() !== lazyRevision
      || run("git", ["-C", lazy, "status", "--porcelain"]).trim()) {
    throw new Error(`Expected clean lazy.nvim ${lazyRevision} at ${lazy}; refusing to change an existing checkout`);
  }
}
const scratch = mkdtempSync(join(tmpdir(), "jusi-package-conformance-"));
try {
  for (const mode of nativeOnly ? ["host-only", "native", "native-before"] : ["host-only", "native", "native-before", "lazy"]) {
    const work = join(scratch, mode);
    const packageRoot = join(work, "site/pack/conformance/start");
    mkdirSync(packageRoot, { recursive: true });
    const host = join(packageRoot, "jusi-host");
    const web = join(packageRoot, "jusi-web.nvim");
    const fixture = join(packageRoot, "argv-provider");
    const markdown = join(packageRoot, "jusi-markdown.nvim");
    const notebook = join(packageRoot, "jusi-notebook");
    mkdirSync(join(notebook, "lua/jusi"), { recursive: true });
    writeFileSync(join(notebook, "lua/jusi/init.lua"), `
local M = { marker = "separate-notebook" }
function M.setup(opts) vim.g.notebook_setup = opts.marker end
return M
`);
    writeFileSync(join(notebook, "lua/jusi/document.lua"), 'return { marker = "notebook-document" }');
    for (const [source, destination] of [
      ["runtime", host],
      ...(mode === "host-only" ? [] : [["packages/jusi-web.nvim", web], ["packages/jusi-markdown.nvim", markdown], ["scripts/fixtures/argv-provider", fixture]]),
    ]) {
      cpSync(join(root, source), destination, { recursive: true });
      run("git", ["init", "--quiet", destination]);
    }
    const script = join(work, "record argv.mjs");
    writeFileSync(script, 'import {writeFileSync} from "node:fs"; writeFileSync(process.env.JUSI_FIXTURE_OUTPUT, JSON.stringify(process.argv.slice(2))); process.stdin.once("data", () => process.stdout.write(JSON.stringify({type:"ready",version:1,capabilities:["surface.web"],surface:{backend:"web",url:"about:blank"}})+"\\n")); process.stdin.resume();');
    const env = { ...process.env, XDG_CONFIG_HOME: join(work, "config"), XDG_DATA_HOME: join(work, "data"),
      XDG_STATE_HOME: join(work, "state"), XDG_CACHE_HOME: join(work, "cache"),
      JUSI_PACKAGE_MODE: mode, JUSI_FIXTURE_NODE: process.execPath, JUSI_FIXTURE_SCRIPT: script,
      JUSI_FIXTURE_OUTPUT: join(work, "argv.json"), JUSI_TEST_HOST: host, JUSI_TEST_WEB: web,
      JUSI_TEST_MARKDOWN: markdown, JUSI_TEST_PROVIDER: fixture, JUSI_TEST_LAZY: lazy, JUSI_TEST_PACKPATH: join(work, "site") };
    const init = join(work, "init.lua");
    const notebookInit = `
vim.opt.packpath = { vim.env.JUSI_TEST_PACKPATH, vim.env.VIMRUNTIME }
vim.cmd("packadd! jusi-notebook")
require("jusi").setup({ marker = "configured-in-user-init" })
assert(require("jusi.document").marker == "notebook-document")
`;
    writeFileSync(init, notebookInit + (mode === "lazy" ? `
vim.opt.rtp:prepend(vim.env.JUSI_TEST_LAZY)
require("lazy").setup({
  { dir = vim.env.JUSI_TEST_HOST, lazy = false, priority = 1000 },
  { dir = ${JSON.stringify(notebook)}, lazy = false },
  { dir = vim.env.JUSI_TEST_WEB, lazy = false, main = "jusi_web", opts = { profile = "configured", text_layer = "off" } },
  { dir = vim.env.JUSI_TEST_MARKDOWN, lazy = false, main = "jusi_markdown", opts = { node = vim.env.JUSI_FIXTURE_NODE, text_layer = "off" } },
  { dir = vim.env.JUSI_TEST_PROVIDER, lazy = false, main = "argv_provider", opts = { command = { vim.env.JUSI_FIXTURE_NODE, vim.env.JUSI_FIXTURE_SCRIPT } } },
}, { local_spec = false, checker = { enabled = false }, change_detection = { enabled = false },
  install = { missing = false }, rocks = { enabled = false } })
` : `
vim.opt.packpath = { vim.env.JUSI_TEST_PACKPATH, vim.env.VIMRUNTIME }
vim.g.jusi_web = { profile = "configured", text_layer = "off" }
${mode === "native-before" ? `
vim.g.jusi_web.profile = "must-not-override"
vim.cmd("packadd! jusi-host")
vim.cmd("packadd! jusi-web.nvim")
require("jusi_web").setup({ profile = "configured", text_layer = "off" })
` : ""}
`));
    // -u is a real user init, not -l/--clean; cwd and all XDG paths are disposable.
    const result = spawnSync(process.env.JUSI_NVIM ?? "nvim", ["--headless", "-u", init,
      "--cmd", "lua vim.opt.runtimepath:prepend(vim.env.JUSI_TEST_HOST)",
      "-c", `lua local ok, err = pcall(dofile, ${JSON.stringify(resolve(root, "scripts/test-package-installation.lua"))}); if not ok then print(err); vim.cmd('cquit 1') end`],
      { cwd: work, env, encoding: "utf8", timeout: 15_000 });
    if (result.error || result.status !== 0) throw new Error(`${mode}: ${result.error ?? "failed"}\n${result.stdout}\n${result.stderr}`);
    console.log(result.stdout + result.stderr);
  }
  console.log(`Package conformance passed${nativeOnly ? " (native only)" : `; lazy.nvim ${lazyRevision}`}`);
} finally { rmSync(scratch, { recursive: true, force: true }); }
