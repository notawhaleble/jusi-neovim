# M2 evidence — package conformance, 2026-09-30

M2 is in progress. This completes the independent package-installation slice, not
the generic backend SDK, worker supervisor or feature-complete document viewers.
M1 Linux acceptance remains open.

`npm run test:packages` passes on macOS arm64, Node 24.10.0, Neovim 0.11.4.
The runner copies host runtime, web package and a second fixture into separate
local Git repositories under a temporary directory. It uses fresh XDG paths, a
real `-u init.lua`, normal startup plugin loading and a cwd outside the source tree.
No repositories are published or committed. Temporary checkouts are removed.

Cases:

- Host-only native package: host commands load without the web provider installed.
- Native packpath: independently copied providers load; global init.lua defaults
  and explicit setup before startup both survive. Invalid options preserve valid
  settings; later explicit setup updates subsequent opens.
- lazy.nvim: local `dir` specs load both providers and apply `opts` after plugin
  startup. Host runtime is explicitly included as an eager plugin spec.
- The second provider runs a Node argument recorder with an executable/argv list.
  Spaces, quotes, semicolons, an empty argument, shell-like text and a file target
  arrive unchanged. No shell is invoked. It opens a web surface and closes normally.
- Runtime tests cover unknown API, duplicate registration, thrown/returned startup
  errors, unsupported backend, duplicate readiness, late readiness after close,
  deletion disposal and preservation of the previously edited buffer.

lazy.nvim is pinned to `85c7ff3711b730b4030d03144f6db6375044ae82`, fetched from its
[official repository](https://github.com/folke/lazy.nvim). The fixture uses its
[documented dir/main/opts spec](https://lazy.folke.io/spec). First run requires
network access; later runs use the verified clean local cache. The runner refuses
to overwrite a differing or modified checkout. `npm run check` runs native cases
without network; CI additionally runs the full pinned-manager conformance suite.

Integration verification: `npm run check` and `npm run smoke:electron` exit 0.
The Electron fixture emitted the known intermittent disposed-frame warning, with
all assertions passing. `.local/review/presentation.png` was inspected. Manual
macOS startup showed the web presentation and Text ready, entered rich mode,
returned to text mode, closed via Ctrl-Q, and exited via :qa! (exit 0).

Initial fixture mistakes (a nonexistent profile buffer variable and exclusion of
Neovim's own packpath) were corrected: the test observes emitted session metadata
and retains `$VIMRUNTIME`. Final tests pass without those startup errors.

Limitations: the second provider is a conformance fixture, not a Markdown/PDF/EPUB
viewer. It owns its short-lived process; host-managed worker readiness, stderr,
timeouts, cancellation and process-tree cleanup are still absent. Only the web
surface backend is implemented. Headless package tests do not prove Linux browser
sandboxing or independent package distribution/signing.

## Backend boundary follow-up — 2026-09-30

Shared PresentationSession, AttachedPresentation and TextDocument contracts now
underlie the compatibility web types. Sessions and attachments carry normalized
backend/URI descriptors validated by a compiled backend registry. Unknown backend,
API-version and duplicate-registration cases are covered by tests. The registry
currently validates descriptors; full renderer lifecycle dispatch is still pending.

Moved DOM extraction/projection scripts out of the shell and local preview logic
out of Electron main into `src/backends/web`, with partition naming alongside them.
The existing DOM script bodies and HTML/HTM raw-serving behavior are preserved.
Local protocol registration now rejects root changes and propagates failures before
attachment; unit tests cover retry after failure, path/symlink escapes, raw HTML/HTM,
escaped text, directory listing and compatibility Markdown output. Initial test
failure was the macOS /var versus /private/var fixture path; canonicalizing the test
root matches production's canonical-root policy. Final tests pass.

Verification under Node 24.10.0, Neovim 0.11.4, macOS arm64:

- `npm run check`: exit 0, including new backend boundary tests.
- `npm run smoke:electron`: exit 0; GPU mailbox warnings appeared during fixture
  lifecycle activity. All assertions passed.
- `npm run smoke:package`: exit 0, including shell/guest OS sandbox evidence for
  Electron 44.5.0 / Chromium 152.0.7977.130. Unsigned instrumented package only;
  the existing author/asar packaging warnings remain.
- Inspected `.local/review/presentation.png` and packaged screenshot.
- Manual app: text cursor movement, rich focus, reload, return to text, Ctrl-Q close
  and :qa! shutdown passed. No orphaned review app remained.

Main/shell still contain web lifecycle orchestration and web compatibility wire
names. Generic attach/detach/focus/dispose dispatch, capabilities, source anchors
and worker transport/supervision are not complete. M2 and M1 platform gates remain
open. These changes add no complete Markdown/PDF/EPUB viewer.

## Renderer lifecycle follow-up — 2026-09-30

RendererSurface now covers attach/detach, resize, focus/mode, update/reload,
extraction/projection/selection, links and dispose. WebRendererSurface owns guest
creation, listeners and raw scripts. Shell dispatches through a compiled factory.
Navigation, reload, crash, cancellation and disposal reject obsolete results.
Main/Neovim tickets remain authoritative. Hidden views retain their guest and
reattach using Neovim bounds. Added lifecycle/error tests and real hidden-tab
identity assertions.

## Validation

Node 24.10.0, Neovim 0.11.4, macOS arm64:

- npm run check: exit 0, including lifecycle tests and embedded-Neovim smoke.
- npm run smoke:electron: exit 0, including tab parking/reattachment.
- npm run smoke:package: exit 0; macOS sandbox assertions passed.
- Both desktop runs emitted known disposed-frame warnings; assertions passed.
  Package remains unsigned/instrumented with author and disabled-asar warnings.
- Development and packaged screenshots inspected.
- Manual text motion, rich focus, reload, return to text, Ctrl-Q close and :qa!
  shutdown passed. Disposable review profile removed after confirmed exit.
- npm run harness and git diff --check: passed.

No dependency changes, commits, publishing or remote CI dispatch. Prior edits
preserved. Linux and signed-release evidence remain unverified.

## Next work

1. Worker transport with capabilities, executable/argv/env/cwd, readiness timeout,
   bounded output/stderr, cancellation and process-tree cleanup. Migrate the second
   fixture from provider-owned vim.system to that contract.
2. Remove MirrorDocument/web wire and Electron document-handle assumptions;
   validate source anchors and an independent non-DOM viewer.
3. Obtain Linux sandbox/package evidence and preserve signed-release gates.

Only the web renderer exists. Cancellation rejects results without terminating
already executing guest JavaScript. This is not a complete external backend SDK.
Full Markdown/PDF/EPUB plugins, certificates, OAuth popups, complete devices,
persistent permissions, dynamic DOM refresh and Unicode guarantees remain absent.
Browser safety parity is not established.

## Worker lifecycle follow-up — 2026-09-30

- Added `jusi.worker(launch)` and runtime-owned POSIX process supervision with
  absolute executable/cwd, literal argv and an explicit replacement environment.
- Versioned hello/ready handshake negotiates surface.web. Readiness timeout,
  64 KiB stdout cap, 8 KiB stderr tail and surface validation fail only the worker.
- Close/cancel/failure/leader exit immediately kill the owned process group.
  Buffer close and VimLeavePre integrate with managed cleanup.
- Migrated the independent argv provider fixture from vim.system to the adapter.
- Tests cover fragmented/invalid/duplicate frames, unsupported/missing capabilities,
  invalid surface, flood, timeout, missing executable, exits, close, cancellation,
  and descendants surviving neither provider close nor worker-leader exit.

## Validation

Node 24.10.0, Neovim 0.11.4, macOS arm64:

- npm run check: exit 0, including new worker tests and embedded-Neovim smoke.
- npm run test:packages: exit 0, native/native-before and pinned lazy.nvim.
- npm run test:workers: exit 0 after adding leader-exit descendant coverage and
  requiring an absolute executable.
- npm run smoke:electron: exit 0, no disposed-frame warnings this run.
- Inspected .local/review/presentation.png.
- Manual desktop: registered managed fixture, opened text-off presentation,
  entered rich focus, Ctrl-Q closed it, :qa! exited the app. No fixture worker
  remained. Disposable review profile removed after exit.
- npm run harness and git diff --check: passed.

No dependency changes, commits, publishing or remote CI. Package smoke was not
rerun: no packaging/renderer changes this session. Prior edits preserved. Linux
and signed-release evidence remain unverified.

## Next work

1. Add durable cleanup for forced Neovim/app death and graceful bounded worker
   shutdown. Current immediate process-group kill is not a save/shutdown handshake.
2. Define revision-aware worker document requests and non-DOM source anchors;
   remove MirrorDocument/web-wire/Electron-handle assumptions with a real viewer.
3. Obtain Linux sandbox/package evidence and preserve signed-release gates.

Only surface.web startup is negotiated; no worker text-extraction protocol exists.
Workers are trusted installed executables, not sandboxed native parsers. Workers
must not daemonize or escape their group. Forced Neovim death can orphan workers.
Windows workers are unsupported. Full Markdown/PDF/EPUB plugins, certificates,
OAuth popups, complete devices, persistent permissions, dynamic DOM refresh and
Unicode guarantees remain absent. Browser safety parity is not established.

## Guardian lifecycle follow-up — 2026-09-30

Each managed worker has a separate headless Neovim guardian using the same binary
without user configuration. Launch options use a private pipe capped at 64 KiB.
Worker stdout and queued diagnostic writes are bounded; stderr can be dropped
under backpressure. Owner-pipe EOF sends a shutdown JSON frame and closes worker
stdin. After 200 ms the guardian kills the group; leader exit cleans descendants.
Runtime callbacks invalidate on close; VimLeavePre waits up to one second for
guardians, which can finish independently. Added real process tests for explicit
close, orderly Neovim exit and SIGKILL, with cooperative/unresponsive workers and
descendants.

## Validation

Node 24.10.0, Neovim 0.11.4, macOS arm64:

- npm run check: exit 0, including worker and real Neovim tests.
- npm run test:packages: exit 0, native/native-before and pinned lazy.nvim.
- npm run test:workers: exit 0 after final loop and orderly-exit coverage.
- npm run smoke:electron: exit 0, no disposed-frame warnings this run.
- npm run smoke:package: exit 0, sandbox assertions passed. Known disposed-frame,
  author metadata, disabled-asar and unsigned-package warnings remain.
- Inspected both screenshots. Guardian file exists in packaged runtime; packaged
  smoke exercises the browser, not a managed worker provider.
- Manual managed presentation: rich focus, Ctrl-Q close, :qa! exit. Shutdown marker
  and terminated worker/descendant PIDs verified. Disposable review files removed.
- npm run harness and git diff --check: passed.

No dependencies changed, commits, publication or remote CI. Prior edits preserved.
Linux and signed-release evidence remain unverified.

## Next work

1. Revision-aware worker document requests and non-DOM source anchors; remove
   MirrorDocument/web-wire/Electron-handle assumptions with an independent viewer.
2. Measure guardian overhead; verify Linux cleanup and packaged worker startup.
3. Obtain Linux browser sandbox/package evidence and preserve signed-release gates.

Only surface.web startup is negotiated. No worker text-extraction protocol exists.
Guardian death, escaped process groups and app death leaving Neovim alive are
outside the pipe-EOF guarantee. Windows workers remain unsupported. Full viewers,
certificates, OAuth popups, complete devices, persistent permissions, dynamic DOM
refresh and Unicode guarantees remain absent. Browser safety parity is not established.

## Worker text requests — 2026-10-01

- Optional text.extract negotiation; one active request per worker, monotonic IDs,
  full document tickets, timeout, cancellation and supersession.
- UTF-8 text/source-anchor validation with explicit line/byte/frame/traffic caps.
  Invalid document results fail extraction while keeping the rich worker alive.
- jusi.extract checks active provider, text policy and current ticket before request
  and callback delivery. Document invalidation cancels outstanding worker work.
- No automatic buffer writes or DOM projection of worker anchors. This is the
  transport/Lua lifecycle foundation; automatic viewer integration remains open.
- Tests cover Unicode, 3000-line replies, invalid UTF-8/ranges/size, errors, timeout,
  wrong tickets, late replies, queued-reply cancellation, close, supersession,
  real provider invalidation and text disabled. Guardian crash tests still pass.

## Validation

Node 24.10.0, Neovim 0.11.4, macOS arm64:

- npm run check: exit 0, including worker requests and real Neovim tests.
- npm run test:packages: exit 0 (native/native-before/pinned lazy.nvim).
- nvim --headless -u NONE -l scripts/test-worker-documents.lua: exit 0 after
  adding explicit close-during-extraction coverage.
- npm run smoke:electron: exit 0; known disposed-frame warnings occurred.
- Inspected .local/review/presentation.png.
- First manual session had unsuccessful command entry (E35). Cause undetermined;
  fresh session passed text movement, rich focus, reload, return to text, Ctrl-Q,
  and :qa! exit. The earlier session was no longer running when work resumed.
- npm run harness and git diff --check: passed.

No dependency changes, commits, publication or remote CI. Prior edits preserved.
Package smoke not rerun this slice; Linux and signed-release evidence remain open.
Disposable review profiles removed after process exit.

## Next work

1. Integrate worker documents through bridge/main/renderer with visible status,
   revision-checked publication and source navigation. Do not reuse DOM offsets.
2. Validate an independent viewer; measure parsing/validation latency and guardian
   overhead. Current bounds are not a performance guarantee.
3. Verify Linux cleanup, packaged worker startup and browser sandbox/release gates.

Automatic renderer text extraction is still DOM-based. Source anchors are
structurally validated, not verified against actual source content. Guardian death,
escaped groups and app death leaving Neovim alive remain outside cleanup guarantees.
Full document viewers, certificates, OAuth, complete devices, persistent permissions,
dynamic DOM refresh and Unicode cursor guarantees remain unfinished. Browser safety
parity is not established.

## Automatic worker publication — 2026-10-01

- Negotiated worker extraction is carried as explicit textSource session metadata,
  retained while parked. DOM extraction remains the default for other providers.
- Nonblocking Lua replies use the requesting host RPC channel, with bounded pending
  requests and exit cleanup. TypeScript revalidates documents before publication.
- Main uses the existing document revision queue; Neovim checks identity at write.
  Text ready follows commit acceptance. Worker anchors are stored separately and
  cleared on invalidation. No fake DOM spans or cursor projection.
- Text-off skips extraction; errors preserve rich interaction and permit retry.
  Navigating away from the declared worker URL fails text instead of mismatching it.
- Added bridge/schema tests and desktop/package tests for async readiness, retry,
  Neovim text, text-off, hidden tabs, reload/stale replies and source mismatch.

## Validation

Node 24.10.0, Neovim 0.11.4, macOS arm64:

- npm run check: exit 0, including bridge, worker, package/native and real Neovim tests.
- npm run smoke:electron: exit 0 on final code.
- npm run smoke:package: exit 0, including actual packaged worker/guardian startup
  and publication (fixture uses explicit system Node; no production Node dependency).
- Smoke deliberately logs extraction-failure and source-mismatch errors. Packaged
  run also logged GPU mailbox/task-policy warnings; earlier run had disposed guest
  warnings. All assertions passed. Unsigned/author/disabled-asar warnings remain.
- Inspected development and packaged screenshots.
- Manual worker presentation: text ready, Unicode text yanked and inspected in
  register, rich focus, reload, return to text, Ctrl-Q close and :qa! exit passed.
- npm run harness and git diff --check: passed.

Initial desktop failure exposed a dependency on an unavailable clipboard RPC
channel variable. Fixed by passing the actual requesting RPC channel explicitly.
Final checks pass. No dependencies changed, commits, publication or remote CI.
Prior edits preserved; disposable profile removed after exit.

## Next work

1. Source-anchor navigation/projection and an independent document viewer. Worker
   text is usable in Neovim, but cursor/selection do not highlight the rich source.
2. Explicit worker source-change/redirect negotiation; currently exact URL matching.
3. Measure large-document performance/guardian overhead; verify Linux worker and
   browser sandbox evidence, preserving signed-release gates.

Full Markdown/PDF/EPUB viewers, certificates, OAuth, complete devices, persistent
permissions, dynamic DOM refresh and Unicode cursor guarantees remain unfinished.
Guardian death/escaped groups remain outside cleanup guarantees. Linux, signed
release and browser safety parity are not established.
# Session handoff — 2026-10-01

M0 complete. M1 open for Linux runtime/package evidence. M2 in progress: optional
worker line-source navigation now passes in development and packaged macOS with an
extractable viewer fixture. R1–R7 remain partial/release-blocked.

## New in this session

- Optional source.navigate capability requires text.extract. Runtime retains anchors
  only after a successful ticket-checked commit; cursor/window events send the whole
  current line range, document ticket, explicit window ID and monotonic sequence.
- Motion coalescing/deduplication, cancellation of queued callbacks, invalidation,
  buffer/window leave and rich-entry clears. No fabricated character/DOM offsets.
- Guardian request lifetime budget increased to 64 MiB; input queue stays 64 KiB.
- Standalone two-paragraph viewer fixture uses public Lua APIs and Node built-ins.
  Development/package smoke extracts it outside the host before loading it.
- Added runtime tests for Unicode ranges, column deduplication, rapid motions,
  split identity, stale commit, invalidation, cancellation and text-off.

## Validation

Node 24.10.0, Neovim 0.11.4, macOS arm64:

- npm run check: exit 0, including worker source navigation and live bridge tests.
- npm run smoke:electron: exit 0; real worker navigation, tab leave/return, rich
  entry, return plus cursor motion, text readiness and cleanup passed.
- npm run smoke:package: exit 0, including copied viewer and packaged guardian.
- Inspected development presentation/source-navigation and packaged source-navigation
  screenshots; source highlight and text-ready status are visible.
- Manual UI: j highlights second paragraph, i focuses guest, Ctrl-\ Ctrl-N returns,
  k moves to first line, Ctrl-Q closes and :qa! exits (process exit 0).
- Expected extraction-failure/source-mismatch logs and disposed-guest warnings
  remain in smoke output; all assertions passed. macOS task-policy warnings and
  unsigned/author/disabled-asar package warnings remain.
- No dependencies changed, commits, publication or remote CI; prior edits preserved.

## Next work

1. Complete shared rich/text mode synchronization: restore source highlight on return
   without requiring cursor motion; suppress commits projecting during native focus.
   Current clear is tied to i, not every native focus transition.
2. Character/selection and click-to-text mapping with explicit source contracts;
   build the first actual independent format viewer beyond the fixed fixture.
3. Explicit worker source-change/redirect negotiation; currently exact URL matching.
4. Large-document performance/guardian overhead and Linux worker/browser evidence.

Full Markdown/PDF/EPUB viewers, certificates, OAuth, complete devices, persistent
permissions, dynamic DOM refresh and Unicode cursor guarantees remain unfinished.
Guardian death/escaped groups remain outside cleanup guarantees. Linux, signed
release and browser safety parity are not established.

# Session handoff — 2026-10-01

M0 complete. M1 open for Linux runtime/package evidence. M2 in progress. Worker
source navigation now synchronizes rich/text mode. R1–R7 remain partial/release-blocked.

## New in this session

- Shell-only presentation-mode IPC carries session, buffer and window identity.
  Main validates attachment/session; Lua validates incarnation/window ownership.
- Neovim i immediately suppresses source projection; native surface focus also
  reports rich mode. Text publication during rich focus retains anchors but does
  not project them. Returning to text restores the current line without motion.
- Window leave clears rich state; stale session/incarnation reports are rejected.
- Runtime, surface and desktop tests cover mode suppression, commit during rich
  focus, restoration without motion, native focus and stale identity.
- Corrected smoke synthetic key modifiers to Electron's modifiers array. Previous
  automation sent control:true, so its return chord had not actually been tested.

## Validation

Node 24.10.0, Neovim 0.11.4, macOS arm64:

- npm run check: exit 0 on final implementation, including surface and runtime tests.
- npm run smoke:electron: exit 0 on final harness.
- npm run smoke:package: exit 0 on final harness; unsigned instrumented macOS app.
- Inspected development presentation screenshot and manual viewer screenshot.
- Manual: j to second line, i to rich focus, Ctrl-\ Ctrl-N restores second paragraph
  highlight without motion; Ctrl-Q closes; :qa! exits with process exit 0.
- Early build failed by reading incarnation from AttachedWebView; fixed to use the
  actual session metadata. Early smoke runs failed on incorrect synthetic modifiers,
  then two test-edit errors (cursor expectation and omitted motion); fixed. Final
  development/package assertions pass. Expected extraction failure/source mismatch,
  disposed-frame/task-policy logs and unsigned/author/disabled-asar warnings remain.
- No dependencies changed, commits, publication or remote CI. Prior edits preserved.

## Next work

1. Build the first actual independent format viewer beyond the fixed two-paragraph
   fixture; define its supported scope and package-local dependencies.
2. Character/selection and click-to-text mapping with explicit source contracts.
3. Explicit worker source-change/redirect negotiation; currently exact URL matching.
4. Large-document performance/guardian overhead and Linux worker/browser evidence.

The mode report is integrated with current shell surfaces, not a complete future
backend action dispatcher. Complete multi-backend/focus-failure conformance remains.
Full Markdown/PDF/EPUB viewers, certificates, OAuth, complete devices, persistent
permissions, dynamic DOM refresh and Unicode cursor guarantees remain unfinished.
Guardian death/escaped groups remain outside cleanup guarantees. Linux, signed
release and browser safety parity are not established.

# Session handoff — 2026-10-01

M0 complete. M1 open for Linux runtime/package evidence. M2 remains in progress;
M5 now has an independently installable Markdown test viewer, not full format
acceptance. R1–R7 remain partial/release-blocked.

## New in this session

- Added optional packages/jusi-markdown.nvim with independent Lua setup/commands,
  package.json/lock, markdown-it 15.0.2 dependency, sample, README and package tests.
  No Markdown dependency or provider registration in the production host bundle.
- JusiMarkdown[!] opens a bounded immutable UTF-8 snapshot through a random loopback
  page. Rich headings/emphasis/lists/quotes/code/tables and HTTP(S) links work.
  Raw HTML is escaped, images are alt-text placeholders, non-web links are inert.
  CSP restricts document resources/scripts; there is no filesystem-serving endpoint.
- Optional text extraction runs in a cancellable Node worker thread. Text and rich
  blocks share original UTF-8/CRLF ranges; compact list paragraphs get real elements
  and table cells inherit row ranges. Common mode/close keys use host infrastructure.
- Added parser and real-worker tests, copied native/lazy.nvim package conformance,
  development/package desktop assertions and CI dependency installation.
- Added ADR 0008 and documented installation/scope. To run the full host checks from
  a fresh checkout, also run npm ci --prefix packages/jusi-markdown.nvim --ignore-scripts.

## Validation

Node 24.10.0, Neovim 0.11.4, macOS arm64:

- npm run check: exit 0, including five Markdown tests, worker/runtime and live tests.
- npm run test:packages: exit 0; copied native and pinned lazy.nvim installations.
  Deliberately missing Node reports Worker closed output without stopping Neovim.
- npm run smoke:electron: exit 0; rich markup, escaped script, no image fetch nodes,
  no guest host API, text publication, Unicode block motion, rich/text and text-off.
- npm run smoke:package: exit 0 with the same external provider copied into scratch.
- Inspected development Markdown/presentation and final packaged Markdown screenshots.
  Corrected malformed backslash formatting in demo after first screenshot inspection.
- Manual Markdown: j, i, Ctrl-\ Ctrl-N restored the paragraph highlight; yy and
  :registers verified readable Unicode text; Ctrl-Q and :qa! closed cleanly (exit 0).
- Early parser test caught compact-list anchors without visible elements; fixed.
  First desktop launch overlapped another tsc writing dist and failed an ES module
  import; reran sequentially successfully. Avoid concurrent builds of shared dist.
- Existing expected extraction-failure/source-mismatch and disposed-frame logs,
  macOS task-policy/GPU mailbox warnings and unsigned/author/asar warnings remain.
- npm installation audited 8 package-local packages, reporting zero vulnerabilities.
  Host dependencies unchanged this session. No commits, publishing or remote CI.

## Next work

1. Expand Markdown scope deliberately: local images with explicit resource authority,
   task lists/math/highlighting if desired, source refresh and better startup errors.
2. Character/selection and click-to-text mapping with explicit source contracts.
3. Explicit worker source-change/redirect negotiation; currently exact URL matching.
4. Performance measurements, Linux worker/browser evidence and actual PDF/EPUB viewers.

Markdown is a test viewer with 1 MiB file and host text/transport caps; it is not
feature-complete GFM. Snapshots require close/reopen to read disk changes. Full
backend action conformance, browser certificates/OAuth/devices/permissions and
Unicode character projection remain unfinished. Guardian death/escaped groups,
Linux, signed release and browser safety parity remain outside verified evidence.
