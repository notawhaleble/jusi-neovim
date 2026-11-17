# M1 evidence — 2026-09-30

## Engine

Pinned Electron **44.5.0**, Chromium **152.0.7977.130** (reported by the real
Electron fixture). Verified against the official
[stable release list](https://releases.electronjs.org/release?channel=stable) and npm
`electron` dist-tags. The official [support policy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)
supports the latest three stable major versions. This is a dated check, not an
indefinite support guarantee.

Node >=22.12 is now required; local validation used `/opt/homebrew/opt/node@24/bin`
(Node 24.10.0). Neovim 0.11.4, macOS arm64. Both package manifest and lockfile pin
the Electron version. Clipboard handling now awaits Electron's async read API.

## Automated validation

`npm run check` and `npm run smoke:electron` pass under Node 24.

New unit scenarios: revision advance, stale queued result, navigation during an
in-flight RPC, buffer-ID reuse, rejected invalidation, bounded graceful shutdown
and escalation. New real-Neovim tests exercise the actual Lua commit module,
including provider replacement, disabled text and deleted buffers. Electron tests
exercise same-URL reload, redirect, guest crash/reload, actual stale IPC submission,
sandbox preferences and no guest Node/bridge, alongside all M0 scenarios.

The fixture profile is owned by a parent runner and deleted after Electron exits,
so cleanup no longer races Chromium cache writes. Screenshot
`.local/review/presentation.png` was visually inspected.

## Package and native UI

An ad-hoc-signed macOS arm64 directory package was built with:

```
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --dir --publish never --config.directories.output=.local/review/m1-package
```

The packaged app was launched with a disposable profile and manually exercised:
split focus, rich mode, Ctrl-R reload, return with Ctrl-\\ Ctrl-N, text navigation,
Ctrl-Q close and :qa! exit. No sandbox-disable flag was used. This proves launch
and interaction; it does not replace independent OS sandbox attestation or signed,
notarized release checks. Final source's crash-status indicator is additionally
covered by the Electron fixture.

The first attempt at the existing `release/mac-arm64` output hit a permissions
error; the successful build used a separate output directory. The global npm
cache also had an access error; install succeeded with `.local/npm-cache`.

## Open validation and release issues

- Linux runtime/package sandbox validation has not run locally: the installed
  Docker client panics when querying its server. Linux CI fixtures and package
  build steps are added, but no remote CI run has been triggered or claimed.
- External worker process trees remain provider-owned until M2 supervision exists.
  The bounded shutdown helper owns embedded Neovim only.
- Dependency remediation is recorded below; a clean audit does not establish
  browser security parity or replace independent review.
- M1 remains in progress until its outstanding platform acceptance evidence is
  recorded. R5 remains release-blocked.

## Dependency and RPC remediation follow-up

Replaced `promised-neovim-client` with `@msgpack/msgpack` **3.1.3** and a typed RPC
transport. Updated electron-builder to **26.15.3**; removed unused `tsx` (and its
esbuild dependency). `npm audit --json` now exits 0 with **zero reported advisories**
across production and development dependencies, down from 17. Current report:
`.local/review/npm-audit-current.json`; the original report remains for comparison.

Regression tests cover fragmented/coalesced messages, non-ASCII text, all three
Neovim extension types and multiple ID widths, concurrent/out-of-order responses,
reverse-order incoming replies, reentrant RPC, handler errors, broken pipes, EOF,
timeouts/late replies, request/write limits, and missing executable startup.
The live fixture resolves actual window 1000 to grid 2 without guessing geometry.

macOS directory package command (Node 24 PATH as above):

```
CSC_IDENTITY_AUTO_DISCOVERY=false node_modules/.bin/electron-builder --mac --dir --publish never --config.directories.output=.local/review/rpc-package
```

This build exits 0; signing was skipped. Its native UI passed split focus, rich
mode, reload, return to text navigation, Ctrl-Q presentation close and `:qa!` exit.
It is local unsigned package evidence, not notarized release validation. Packaging
warned about missing author/description and disabled asar; these are still open
packaging hygiene issues. No sandbox-disable option was used.

Final `npm run check` and `npm run smoke:electron` both exit 0 after the transport
migration. The final Electron run printed disposed-frame warnings while exercising
lifecycle behavior, with all assertions passing; an earlier passing run printed
GPU mailbox warnings. Screenshot inspection confirmed rich content and Text ready.

## Automated packaged sandbox follow-up — 2026-09-30

`npm run smoke:package` builds an unsigned instrumented macOS arm64 directory
package and runs the complete Electron fixture with `app.isPackaged === true`.
Exit 0 on two runs. Electron 44.5.0 / Chromium 152.0.7977.130. The shell, remote
guest and local guest each reported OS-level `sandboxed: true` through Electron's
ProcessMetric API. `.local/review/packaged-sandbox.json` records this evidence;
`.local/review/packaged-presentation.png` was inspected (rich local content and
Text ready). This verifies the instrumented directory package, not a signed release
artifact or the completeness of its sandbox policy.

`npm run check` and `npm run smoke:electron` also passed with the new sandbox
assertions. Packaged runs had no disposed-frame or GPU warnings. A final development
rerun emitted disposed-frame warnings and passed; this remains intermittent. The package
build still warns about missing author metadata and disabled asar; signing is
intentionally skipped. No sandbox-disable flags were used.

Linux CI now builds AND runs the packaged fixture, collecting seccomp/filter-count
and NoNewPrivs evidence; negative parser/assertion tests pass locally. Linux runtime
validation remains unrun: local Docker again failed with its nil-pointer panic.
No remote CI run was triggered. See [packaged validation](PACKAGED-VALIDATION.md).
M1 stays open; independent M2 implementation may proceed, with acceptance still
dependent on M1 completion.
