# Local alpha finish line

Status: in progress; not accepted. User selected this as the next product target
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
The unresolved native refresh-focus timeout remains documented. Any failure that
also affects the default transport is an alpha blocker.

Excluded from the alpha promise: Linux support, public/signed distribution,
automatic updates, browser security parity, universal website compatibility,
real OAuth/device/custom-certificate support, complete shadow/frame/bidi mapping,
and new non-browser providers. Existing guest isolation, TLS verification, profile
separation and IPC protections remain required; exclusions do not permit weakening
them. Missing advanced mappings must not corrupt Neovim state.

## Acceptance checklist

All five items need recorded acceptance; existing evidence is a starting point,
not a declaration that the alpha is ready. A1 tuning is deferred by user direction on 2026-10-12; proceed through A2–A5
with the measured performance limits recorded, without claiming A1 accepted.

| Gate | Current evidence | Remaining acceptance |
| --- | --- | --- |
| A1 — Responsive automatic text | Isolated wrapped extraction improved ~5.4x; default automatic-publication/host timing and cancellation trials added ([evidence](ALPHA-TIMING.md)); Unicode remains slow | Measure navigation to rich paint and Neovim publication with automatic extraction; measure host-renderer stalls and real input delivery. Use 200k words, one huge wrapped node, and a Unicode sample, three runs each on the recorded machine. Exercise mutation and cancellation during work. Keep the 8 ms slice target and 50 ms host-stall gate explicit; diagnose misses. |
| A2 — Reliable everyday workflow | Accepted 2026-10-12 for the scoped default adapter: combined source/package workflow passes navigation/reload/zoom, retained form input across modes/tabs/splits, editor ownership, failed-text retry, text off and close/reopen. Commands/logs in STATUS. | Keep regression coverage; real IME and manual input/layout acceptance remain A3/A5. |
| A3 — Input and layout | Packaged macOS ABC dead-key input produced é; manual copy/paste produced éé. Trusted composition started; end event unconfirmed. See STATUS. | Combined manual acceptance for typing, clipboard, rich/text transitions, scrolling, resize and supported zoom on the default adapter. Exercise one real OS IME composition workflow; fix interception or lost input. Record unsupported complex selection/layout cases explicitly. |
| A4 — Reproducible local setup | Accepted on macOS arm64. Production build, normal and clean launch, missing-executable dialog, cookie persistence, private isolation and shutdown verified. [Quickstart](../MACOS-QUICKSTART.md). | Complete for the local alpha scope. |
| A5 — Final alpha checkpoint | Checkpoint attempted: check, full source smoke, default packaged smoke and everyday workflow passed. Packaged focus regressions remain; see STATUS. | On frozen code, required check/desktop/package suites pass; run one combined manual review including the deferred commands/cap queue. Record artifact/version, known issues and scope in an alpha handoff. No unresolved default-path blocker and no unsupported parity claims. |

A1 timings must distinguish guest work, main-process work, host-renderer stalls,
and Neovim publication. Do not substitute isolated guest timers for host UI evidence
or treat a blank/loading interval as rich first paint. Missing measurements keep
A1 open. Three trials are a bounded alpha check, not broad statistical acceptance.

A2 uses automated evidence wherever it is meaningful. A3/A5 may share one combined
manual session at the checkpoint to avoid duplicate review. The selective policy in
AGENTS.md remains in force; alpha planning does not advance the 2/3 deferred UI
counter. Native OS/IME acceptance requires actual native interaction.

For each gate, add dated commands, exit codes, artifact paths and unresolved failures
here or in STATUS before marking it accepted. A new out-of-scope feature request
belongs in the wider plan rather than silently extending this checklist. Acceptance
of this alpha does not mark M1–M6 complete or change R5's blocked-release status.

## Immediate implementation step

Further performance optimization is deferred by user direction (2026-10-12).
Keep the Unicode initial-paint/publication cost and unverified strict slice budget
visible in A1; do not block everyday-workflow and setup acceptance on tuning.
A2 automated acceptance is complete. A4 setup/restart is accepted. Schedule A3 input/layout and real IME acceptance with the A5
combined manual checkpoint. A1 still needs an explicit disposition before the
alpha is declared accepted.
