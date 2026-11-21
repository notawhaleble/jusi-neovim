# Local alpha finish line

Status: accepted for the local macOS arm64 scope on 2026-11-20. User selected this as the next product target
on 2026-10-11. This is a bounded checkpoint within the wider R1–R8/M0–M6 plan,
not completion of those requirements or a browser-safety certification.

## Supported scope

A locally built Neovim presentation host on the current macOS arm64 machine, using
the default browser presentation and a Jusi-owned profile. Open ordinary remote
pages and supported local HTML, use Neovim windows/tabs and optional text navigation,
interact with forms, and close/reopen cleanly. Normal user configuration and clean
mode must have understandable startup behavior. Preserve independent package
boundaries; the existing Markdown package remains optional conformance evidence.

Native in-window popups stay behind JUSI_NATIVE_POPUPS=1. Continue running their
shared-behavior regressions when shared code changes, but do not enable them by
default or make their entire experimental backlog a prerequisite for this alpha.
The packaged native refresh-focus regression passed on 2026-11-20. Any failure that
also affects the default transport is an alpha blocker.

Excluded from the alpha promise: Linux support, public/signed distribution,
automatic updates, browser security parity, universal website compatibility,
real OAuth/device/custom-certificate support, complete shadow/frame/bidi mapping,
and new non-browser providers. Existing guest isolation, TLS verification, profile
separation and IPC protections remain required; exclusions do not permit weakening
them. Missing advanced mappings must not corrupt Neovim state.

## Acceptance checklist

All five local alpha gates have a recorded disposition.

| Gate | Current evidence | Remaining acceptance |
| --- | --- | --- |
| A1 — Responsive automatic text | User accepted the measured timing as usable. Large Unicode pages can take about 8.6–8.7 seconds to publish text on the recorded machine. [Timing evidence](ALPHA-TIMING.md). | Accepted for this alpha with the 8 ms slice target unverified. |
| A2 — Reliable everyday workflow | Accepted 2026-10-12 for the scoped default adapter: combined source/package workflow passes navigation/reload/zoom, retained form input across modes/tabs/splits, editor ownership, failed-text retry, text off and close/reopen. Commands/logs in STATUS. | Keep regression coverage; real IME and manual input/layout acceptance remain A3/A5. |
| A3 — Input and layout | Accepted for local alpha. The user completed the suggested manual workflows in a development instance. Packaged macOS ABC dead-key composition and clipboard have separate evidence in STATUS. | Candidate-based IME remains unverified. |
| A4 — Reproducible local setup | Accepted on macOS arm64. Production build, normal and clean launch, missing-executable dialog, cookie persistence, private isolation and shutdown verified. [Quickstart](../MACOS-QUICKSTART.md). | Complete for the local alpha scope. |
| A5 — Final alpha checkpoint | Accepted for the scoped macOS arm64 checkpoint on 2026-11-20. User manual review, source checks and the complete packaged suite passed. See STATUS for the artifact and logs. | Complete. |

A1 timings must distinguish guest work, main-process work, host-renderer stalls,
and Neovim publication. Do not substitute isolated guest timers for host UI evidence
or treat a blank/loading interval as rich first paint. The measured limits are recorded in the timing evidence. Three trials are a bounded alpha check, not broad statistical acceptance.

A2 uses automated evidence wherever it is meaningful. A3/A5 may share one combined
manual session at the checkpoint to avoid duplicate review. The selective policy in
AGENTS.md remains in force; alpha planning does not advance the 2/3 deferred UI
counter. Native OS/IME acceptance requires actual native interaction.

For each gate, add dated commands, exit codes, artifact paths and unresolved failures
here or in STATUS before marking it accepted. A new out-of-scope feature request
belongs in the wider plan rather than silently extending this checklist. Acceptance
of this alpha does not mark M1–M6 complete or change R5's blocked-release status.

## Performance disposition

The user accepted the measured performance on 2026-11-20. Further tuning is deferred.
