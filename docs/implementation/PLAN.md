# Implementation plan and acceptance gates

The source of task status is `requirements.json`; the latest handoff is
`STATUS.md`. Partial means working foundation with explicit missing acceptance
criteria. A release blocker is not an agent waiting for user permission.
Milestone dependencies govern acceptance/closure. Independent implementation may
proceed while platform evidence is unavailable, provided the prerequisite stays
open and its missing evidence remains explicit. M2 work need not wait for a Linux
machine; M2 cannot be marked complete while its M1 prerequisite is incomplete.

## Current priority — reported web-buffer defects

2026-11-05: ordinary video exit is reproducible with a second live DOM webview.
Electron sibling exit propagation can window the shared host independently of
host shortcuts. ADR 0044 now assigns native window transitions exclusively to
the shared coordinator. Acceptance covers F, Escape, double-click and button,
both adapters, a sibling view, and absence of OS exit/re-entry. See STATUS for
verification. Next: real-site replay after restart; prior manual queue remains due.
The earlier shortcut trace did not establish the user's physical chord.

2026-10-31: user trace and confirmation identified retained Control after Ctrl-O
as the cause of blocked controls and the subsequent new-tab link. ADR 0050 now
uses current trusted mouse modifiers, with both-adapter source/package acceptance
(STATUS). Next: real-site replay after restart and a marked failing fullscreen
capture. The supplied trace contains no document fullscreen transition. Immediate
pause-state feedback and incident logging remain available. Live CUA review is
not passed; do not close the recurring fullscreen report from synthetic evidence.

2026-10-30 follow-up: preserve host fullscreen after prior capability probes;
exercise document fullscreen boundaries and lost modifier releases followed by
fresh keyboard snapshots in both adapters; verify Ctrl-P and command text-building
toggles in text/rich modes. Keep intermittent real-site link routing and native
fullscreen re-entry findings open unless reproduced and explained.


Historical sequencing from 2026-10-16 (the bounded editor pass resumed on
2026-11-18):
1. Address the five observed issues in [WEB-BUFFER-ISSUES.md](WEB-BUFFER-ISSUES.md).
   Updated 2026-10-17: after W1/W3, prioritize W5 app-switch input recovery,
   then W4 fullscreen, and investigate W2 last (user no longer reproduces it).
   W1/W3/W5 and scoped W4 macOS acceptance are complete (STATUS). W2 was
   investigated without a production fix: original failure not reproduced; a
   focused DOM post-reload input timeout remains unresolved (STATUS). On 2026-10-18,
   one/ten-reload traced runs passed without a W2 production fix. Host fullscreen
   modifier resets and both-adapter shortcuts are implemented (ADR 0043, STATUS).
2. Resume and finish the scoped Neovim conformance path.
3. Define browser conformance boundaries, then work through that acceptance plan.

Neovim is usable for the user's everyday work; remaining conformance gaps are
explicitly deferred, not closed. The earlier stale unrelated-message pager defect
has a scoped regression fix; the paused Fugitive push and subsequent pull now have local macOS
renderer evidence (2026-11-18 STATUS). Network push latency is a separate issue.
Existing alpha/release gates below remain valid but do not override this work order.

## Current delivery target — local alpha

The next finish line is [LOCAL-ALPHA.md](LOCAL-ALPHA.md): a locally built macOS
alpha with five bounded acceptance gates. Prioritize that checklist when choosing
implementation work. Native popups now use horizontal splits by default; broad browser parity,
Linux and external providers retain their existing longer-term gates. This scoped
checkpoint does not override the dependency/closure rules for M1–M6 below.
User direction on 2026-10-12 defers further optimization: proceed with A2 everyday
workflow and A4 setup while retaining A1 measured limits and partial status.

## M0 — reviewed foundation

Deliver ADRs and findings, versioned Lua registration, separately packaged web
adapter, optional/cooperative text jobs with shell status, named profiles,
guest/IPC/local-file boundaries and asserted integration fixtures. Preserve user
edits. Run build/unit, real Neovim and Electron checks. Schedule screenshot/manual
review according to AGENTS.md; retain explicit release-gate visual acceptance.
Do not describe R1–R7 as complete merely because this milestone passes.

## M1 — engine and document identity

Upgrade Electron to a supported stable release verified on the day of the work;
pin/update lockfile and record Chromium/Electron versions. Test macOS and Linux
packaged sandbox behavior without `--no-sandbox`. Add session UUID and monotonically
increasing document revision. A revision must be invalidated in main and Neovim
before late text writes can commit. Buffer close, provider replacement, redirect,
reload and renderer crash each invalidate outstanding jobs. Handle Neovim exit
and provider shutdown with bounded waits and no orphan processes.

Acceptance: stale completion before/after IPC, same-URL reload, close/reopen with
reused buffer ID, hidden tab, split reattachment, crash/restart. No geometry guesses.

## M2 — backend SDK and packages

Introduce PresentationSession/AttachedPresentation/TextDocument contracts and a
backend registry. Migrate compatibility web names behind the web backend. Move
DOM extraction/projection out of the shell and local preview out of Electron main.
Do not import arbitrary plugin JS into the trusted shell. A provider uses an
explicit transport and validated bounded data, with capability negotiation.
Worker launcher uses executable + argv + deliberate env/cwd, cancellation,
readiness timeout, process-tree cleanup and stderr diagnostics. A missing optional
executable affects only its provider. Core has no Markdown/PDF/EPUB dependencies.

Acceptance: extract web package to an independent temp repository; install with
native packpath and lazy.nvim in isolated configurations. Register a second provider
without editing core, pass arguments containing spaces/quotes/semicolons literally,
and test unsupported API/backend, duplicate registration, failed startup, late
ready, close, process exit and user-init config startup. Publish only when requested.

## M3 — text lifecycle and mappings

ADR 0030 adds text-bearing control activation, Tab/Shift-Tab region cycling,
per-window refresh anchors and filtered/batched mutations. Acceptance uses shared
both-adapter cases for nested/disabled/custom controls, actual shifted key delivery,
rapid ordered region keys, inserted text above the cursor and paint-only churn.
Remaining: real YouTube playback/infinite-scroll measurement, incremental extraction
for continuously changing text, durable DOM anchors for rewrap/replacement, and
textless/custom/shadow/frame regions. Explicit Ctrl-J activation carries a user
gesture (ADR 0031); it does not emulate trusted DOM events. Immediate AX observation after rapidly batched native history keys showed the
prior hash; manual rapid-history acceptance remains open, separate from serialized
Neovim region navigation.

Implemented foundation (ADR 0023): **shared browser interaction**. Action dispatch now runs
through DOM and native adapters using the same browser behavior, including shared
cursor/index conversion and scroll/link orchestration. Commands carry authoritative
identity/cursor/revision; input coordinates and focus remain transport responsibilities.
Trusted retry reaches the shared text job. Preserve this boundary in subsequent work.

Acceptance for both adapters: link activation, scrolling with cursor projection,
hit-test-to-Neovim cursor, retry after failure, and stale/hidden/replaced target
rejection. Test common behavior once as adapter conformance; retain transport-specific
integration checks where actual focus, event delivery or coordinates differ. The
shared fixtures pass on macOS in development and packaging. ADR 0024 adds code-point/
UTF-16 conversion, inclusive emoji/accent selection and real click roundtrips.
ADR 0025 adds Neovim-resolved exclusive/reversed and ordinary rectangular block
spans with both-adapter geometry acceptance. Remaining selection cases include block
dollar-motion, partial terminal cells and complex grapheme/bidi/cross-node acceptance.
ADR 0026 shares mode chord interpretation and covers focus-loss cancellation, typing
and retained input across rich/text transitions. ADR 0027 shares reload/history/zoom
dispatch; command acceptance includes real keyboard delivery and document reload.
Focus regression mode: `JUSI_TEST_NATIVE_POPUPS=1 JUSI_TEST_FOCUS_ONLY=1 node
scripts/run-smoke-electron.mjs`; packaged: `npm run smoke:package -- --focus-only`.
The shared focus fixture waits for bounded restoration after native parking and
checks the retained field/value. Focus-only mode delays a shell acknowledgement
and exercises five text refreshes. Full package smoke also runs this focused mode
against the same build. A momentary unfocused hidden view is not permanent focus
loss. The older packaged refresh-focus timeout remains unexplained; keep its
failure-only diagnostics and investigate on reproduction, then measure extraction
performance. ADR 0028 adds shared visible cap reporting,
atomic rejection of incomplete extraction, and intra-node cooperative yield points.
Isolated Chromium measurements and wrapped-range optimization are recorded in
[M3-PERFORMANCE.md](M3-PERFORMANCE.md); default automatic-publication trials are in
[ALPHA-TIMING.md](ALPHA-TIMING.md). Broader end-to-end 200k-character timing, huge wrapped
nodes, rich first paint, input latency and host UI stalls still need both-adapter
performance acceptance; the 8 ms slice target is not uniformly met. Remaining
rich window accelerators remain a separate command backlog. ADR 0049 adds shared
platform clipboard editing commands; acceptance covers both adapters with page
selection, multiline Unicode, textarea cut/paste and contenteditable plain paste. Real IME, cross-tab focus
races and the explicit selection limits stay in the backlog; basic fixtures do not
establish full parity.

Provide on/off per open, cancellation and retry, revision-aware atomic publication,
progress/ready/error UI independent of content, source anchors and Unicode-correct
cursor projection. Preserve rich display while text is pending/failed/off. Use
cooperative time slices for DOM and workers for file parsing. Auto-refresh DOM
mutations with a bounded debounce and invalidate geometry on resize/zoom/fonts.
Avoid copying password/input values into the mirror. Treat all output as untrusted.

Acceptance: 200k characters, a huge single text node, mutation during extraction,
emoji/combining/CJK/RTL, empty/image-only content, navigation/cancel/retry, equal
text with changed layout, malformed/oversized provider output. Measure rich first
paint, input latency and extraction slice p95; target 8 ms slices and no host UI
stall over 50 ms on a recorded test machine. Exhausting a cap must be visible.
Text failure must not break rich input. DOM extraction is not guaranteed parallel
CPU execution merely because its API returns a Promise.

## M4 — browser functionality

Opener-preserving native-view integration is gated by
[NATIVE-VIEW-PLAN.md](NATIVE-VIEW-PLAN.md); the engine capability fixture is not
production tab adoption or layout/text acceptance.

Profile selection, explicit private mode, cookies/storage restart persistence,
logout/clear profile UI, permission history/revoke and origin display. Test main-
frame and iframe media origins, stale prompts, OS denials and macOS entitlements.
Add mediated OAuth/new-window navigation, downloads with explicit destinations,
external protocol confirmation, popup-block feedback, basic history/reload and
crash recovery. Add device capability providers only when their permission/UI
flows are complete (camera, mic, display capture, USB/HID/Bluetooth separately).

CA trust and client identities are different settings. Implement supported imports
and profile/OS scope disclosure, cancellation, persistence and removal. Test valid
custom chains, untrusted/expired/mismatched certificates and mutual TLS. Never
turn verification off to make a fixture pass. Do not silently access Chrome profiles.

User priority (2026-10-19): expose per-document DevTools before continuing the
existing conformance queue (ADR 0045). Verify Neovim command and F12, correct guest
selection in both adapters, missing capability/error paths and document teardown.
User clarified private CA/server trust on 2026-10-20 for corporate development
environments. Documented platform import/removal is in docs/browser/private-ca.md;
no custom verifier or app-local trust store is introduced. Confirm target OS,
then validate actual import/restart/removal and trusted-chain/negative cases in
that platform before upgrading R6 evidence. Client identities remain separate.

## M5 — non-browser-content providers

Scope update: non-browser plugins are developed in their own repositories and separate
sessions. The existing Markdown test package is sufficient proof for the current host
work. Do not extend its format features or add PDF/EPUB implementations here. Keep the
provider contract/conformance harness in core; defer the authoring skill until requested.
The acceptance criteria below remain external integration goals.

Demonstrate independent Markdown, PDF and EPUB repositories or local extractable
fixtures using M2 without changes to core. Define feature-complete Markdown scope
explicitly (CommonMark/GFM, fenced code, links, images, tables, math if selected),
PDF page navigation/zoom/search/selection, EPUB spine/navigation/reflow/search.
Dependency installation remains per package; no global all-viewers bundle.
OCR for scans and DRM support are separate optional capabilities, not implied.

Acceptance: install/remove each package independently; omit its executable; test
rich/text keys, text off, large documents, Unicode, embedded links, corrupted files
and cleanup. Validate format-specific anchors. Document capability limitations.

## M6 — release acceptance

Run deterministic local adversarial web fixtures: Node/IPC access, nested guests,
file/protocol navigation and redirects, iframe requests, popups, TLS failures,
permissions, downloads, extraction floods and malicious output. Test authenticated
sessions across app restart without saving credentials in fixtures/logs. Verify
signed macOS and Linux packages, permissions/entitlements, sandbox and crash recovery.
Require independent security review and a security-update owner/SLA, delivery,
rollback, dependency advisories and supported-version check. R5 stays blocked
until evidence supports the scoped comparison to a regular browser.

## Session evidence template

Record date, milestone, changed behavior, exact commands and exit status, manual
workflows and screenshot, unresolved failures, known regressions, next concrete
step. Never store account credentials, cookies or certificate private keys in
repository fixtures. Test browser profiles must be disposable.

## Browser navigation and reading-state acceptance (ADR 0031)

Exercise both adapters: same-document target=_blank activation, real history after
Ctrl-J, Cmd/Ctrl-click and Ctrl-N foreground tabs, Ctrl-Q closure, actual URL copying,
exclusion of visually clipped labels from extracted text, pause/manual refresh/resume,
and statusline readiness. Scripted popups require the command permit, retain opener
and exact Session, use horizontal splits, and create no additional app frame.
Review split/statusline layout once; keep deterministic scenarios in the shared
browser workflow harness and run through development and packaged transports.
Remaining integration work includes real-site OAuth/media/IME, cross-platform
modifier behavior, arbitrary CSS clip geometry, and durable anchors across rewrap.

## Neovim UI conformance follow-up (ADR 0032)

The message display lifecycle slice is followed by the scoped priorities and
acceptance matrix in [NEOVIM-INTEGRATION-REVIEW.md](NEOVIM-INTEGRATION-REVIEW.md):
flush-atomic publication, tab handle reconciliation, explicit-grid native mouse/tab
input, custom/native overflow separation, and external cmdline/dialog conformance.
Keep Linux attention reproduction separate from passing macOS highlight evidence.

The authorized conformance pass is sequenced in
[NEOVIM-CONFORMANCE-PLAN.md](NEOVIM-CONFORMANCE-PLAN.md): C1 frame/tab identity,
C2 native pointer/tab routing, C3 external UI lifecycle, C4 display/event fidelity.
C1's durable contract is ADR 0033. Complete and verify one coherent slice at a time.
