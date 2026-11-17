# Packaged validation

Run `npm run smoke:package` on macOS, or `xvfb-run -a npm run smoke:package` on
Linux. Node >=22.12, Neovim and normal Electron desktop prerequisites are required.
The command compiles, builds a directory package, runs it with a disposable
profile, and exits nonzero if any assertion fails. No publishing or signing
credentials are used. Never add sandbox-disable switches to make it pass.

The test build uses `scripts/smoke-electron.mjs` as its main entry point; that
fixture imports the unchanged application main module. It includes the fixture
and sandbox collector only through a generated electron-builder configuration.
Normal builds retain `dist/electron/main.js` and do not include either script.
This is instrumented package validation, not verification of an identical signed
release artifact. Renderer preferences and guest preload restrictions are unchanged.

The same fixture checks text on/off, real window ownership, reload/redirect stale
commits, crash recovery, shared cookies, rich-mode close, guest Node/IPC absence,
local root confinement and local network denial in development and packaged runs.
It also checks shell, remote guest and local guest process sandbox evidence:

- macOS: Electron's [ProcessMetric.sandboxed](https://www.electronjs.org/docs/latest/api/structures/process-metric)
  must report true for the corresponding OS process ID. This checks runtime state,
  beyond the configured web preference.
- Linux: [`/proc/PID/status`](https://docs.kernel.org/filesystems/proc.html) must show seccomp filtering, NoNewPrivs and more seccomp
  filters than the parent main process. The comparison rejects inherited container
  restrictions alone. This validates filter presence, not policy completeness or
  namespace isolation. Missing fields fail closed; kernel support is required.

The Linux collector has negative unit tests, but has not yet run on a real Linux
renderer. MacOS checks pass locally. Neither result replaces independent review,
exploit testing, signed release checks, or establishes Chrome-equivalent safety.

Outputs:

- `.local/review/development-sandbox.json`, `presentation.png`
- `.local/review/packaged-sandbox.json`, `packaged-presentation.png`
- `.local/review/packaged-smoke/build/` (test-only package; do not distribute)

Reports include collection time, platform, architecture, engine versions, packaged
state, process roles and sandbox observations. The parent removes stale evidence
before each run and removes temporary profiles after process exit. CI uploads only
the named screenshots/reports, including hidden paths; it excludes profiles and
package binaries. Existing output from another mode is not evidence for this run.

M1 acceptance still needs a successful Linux run. M6 additionally needs actual
signed release artifacts, namespace/policy review, update delivery, certificates,
permissions and independent security review.
