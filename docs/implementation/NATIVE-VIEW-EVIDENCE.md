# Native-view capability evidence — 2026-10-02

Scope remains core/browser. Non-browser implementations and authoring skill remain
external/deferred. M1 Linux acceptance is open; M2–M4 are in progress; M5 is deferred.
R1–R7 remain partial/release-blocked. This slice is an executable engine capability
gate and integration design, not a production surface migration.

## New in this session

- Added scripts/adoption-cases.mjs and npm run smoke:adoption. The isolated runner
  uses disposable profiles and its own artifact cleanup. The same gate runs inside
  desktop and packaged smoke; CI artifact collection includes adoption screenshots.
- The gate adopts the actual WebContents supplied to createWindow into a native
  WebContentsView. It preserves the real Chromium document while unmounted, parked,
  resized and moved between fixture host windows. No URL replay is used.
- Persistent/private session identity, redirects, cross-origin opener/postMessage
  source identity, JS state, input value, sessionStorage, script close, about:blank,
  POST/redirect and source-destruction cleanup are asserted. Existing extraction
  runs against the retained document and excludes input values. OS sandbox evidence
  covers both child sessions.
- ADR 0014 records the capability and its limits. NATIVE-VIEW-PLAN.md defines the
  Neovim ownership handshake, failure cleanup, native stacking/layout, input/text and
  new-window policy acceptance gates. Production behavior stays on ADRs 0012–0013.

## Validation

macOS arm64, Node 24.10.0, Neovim 0.11.4, Electron 44.5.0 / Chromium 152.0.7977.130:

- npm run check: exit 0, including unit/runtime/provider/worker/document/package
  conformance and live Neovim.
- npm run smoke:adoption: exit 0 after the fixes below.
- npm run smoke:electron: exit 0 with existing browser/provider cases plus adoption.
- npm run smoke:package: exit 0 with adoption and native-view OS sandbox assertions.
- Inspected .local/review/presentation.png: rich content, local identity, cursor and
  Text ready visible. adoption.png and packaged-adoption.png show the retained child
  and preserved input after moving/resizing it.
- Manual disposable native-view fixture: inspected the reattached child, focused its
  input, verified native keystrokes and pasted a test value. The fixture asserted the
  value, completed both session cases and exited 0. Test profile removed after exit.
- Initial integrated smoke timed out because createWindow built a new WebContents
  using preferences alone. Isolated test identified the unrelated blank document;
  passing options.webContents fixed it. No production backend was modified.
- Cleanup initially accessed a destroyed view's missing webContents property; retaining
  document references separately fixed it. POST target=_blank initially had no opener;
  the opener-preservation case now explicitly requests rel=opener. POST data itself
  was preserved. The manual-only bootstrap initially quit between hosts; preventing
  normal quit until fixture completion fixed that review-run issue.
- Existing disposed-frame diagnostics, intentional worker-failure/source-mismatch
  errors and macOS/unsigned/author/asar warnings remain. Final checks pass.
- No dependencies changed, real logins, commits, publishing or remote CI execution.

## Limits

The fixture uses fixed bounds and a test-only window handler. It does not establish
Neovim-owned native-view attachment, text publication/projection, trustworthy chrome
stacking, common key routing, automatic background/target=_blank routing or real OAuth.
Source lifecycle is engine-level evidence, not the future Neovim allocation protocol.
No production guest is adopted yet. Linux, signed releases, browser safety parity,
media/certificates, packaged profile management/restart and earlier text/performance/
worker acceptance gaps remain open.

## Next work

Implement gate 1 of NATIVE-VIEW-PLAN.md: bounded main-owned child reservations and the
Neovim tab/buffer binding handshake, with exact incarnation/session identity, rejection
cleanup and both directions of close. Keep native views unmounted until ownership is
confirmed. Then integrate grid placement, trusted controls, input and optional text
before enabling the new backend. Automatic routing follows those integration gates.

## Follow-up: Neovim ownership gate


- Implemented NativeChildOwner and jusi.native-child: bounded main-owned reservations,
  trusted Neovim tab/buffer allocation, and binding only after RPC and bridge state
  agree on token/incarnation. Actual Chromium documents and Sessions are retained.
- Reserved native buffers are excluded from DOM attachments, preventing URL replay.
  Source profile/private/text settings inherit; private children share the exact source
  Session without exposing arbitrary partition overrides.
- Close propagates both ways, including parked children. Timeout, late reply, failed
  allocation, source navigation/crash/replacement and Neovim exit clean up. Lua epoch/
  sequence guards prevent late allocations; token/incarnation guards preserve replaced
  buffers. Limits: five-second binding, one child per source, sixteen per controller.
- Added unit and real Lua lifecycle tests. Adoption smoke now drives a real Neovim,
  waits for ownership before mounting, and checks browser close, Neovim close, source
  close, private policy and no duplicate DOM attachment in development and packaging.
- ADR 0015 records ownership; NATIVE-VIEW-PLAN gate 1 is implemented internally.

## Validation

macOS arm64, Node 24.10.0, Neovim 0.11.4, Electron 44.5.0 / Chromium 152.0.7977.130:

- npm run check: exit 0, including lifecycle units, real Lua cancellation/allocation,
  existing provider/worker/document checks and live Neovim.
- npm run smoke:adoption: exit 0. After the final tab-allocation adjustment, the same
  adoption suite passed again through both commands below.
- npm run smoke:electron: exit 0, including retained native document ownership/close.
- npm run smoke:package: exit 0, including ownership and OS sandbox assertions.
- Inspected .local/review/presentation.png (local scope, rich cursor, Text ready) and
  packaged-adoption.png (retained child content/input after parking and reattachment).
- Interactive disposable fixture regenerated from current adoption-cases: focused and
  pasted into the bound/reattached native input, verified the displayed value, clicked
  Finish review. Remaining persistent/private ownership/close assertions passed, exit 0.
- Final allocation uses tab split plus the explicitly allocated buffer; it never deletes
  an inferred temporary buffer that an autocmd could replace. Final check/smokes pass.
- Existing disposed-frame diagnostics, intentional worker-failure/source-mismatch errors
  and macOS/unsigned/author/asar warnings remain. No new failing acceptance checks.
- No dependency changes, real account login, commits, publishing or remote CI execution.

## Limits

Production main does not yet instantiate the ownership controller. Fixture views use
fixed bounds; grid placement, trusted chrome stacking, native focus/common shortcuts,
text publication/projection and automatic new-window routing remain unimplemented for
adopted documents. The trusted caller must map the source identity to its real opener.
No browser security parity claim. Linux, signed releases, real OAuth, OS media and
certificates, packaged profile management/restart and previous acceptance gaps remain.

## Next work

Implement gate 2 of NATIVE-VIEW-PLAN.md: explicit session/window/grid/generation native
placement, fail-closed clipping/visibility, split/tab reattachment and trusted controls
that cannot be covered by page content. Then integrate input/optional text (gate 3)
before enabling production adoption or automatic new-window routing (gate 4).

## Follow-up: floating ownership


- Internal native-child allocation now creates a centered, bordered Neovim float
  instead of a tab. Geometry scales with editor dimensions (maximum 100x30 cells).
  VimResized updates only matching owned windows; unusably small editors close them.
- Requires a source visible in the current tab, with an unambiguous source window.
  Opening selects the source then float; closing returns to the source. Auxiliary
  buffers use bufhidden=wipe, so float close propagates to the retained native document.
- Runtime tests cover no extra tab, source preservation, float geometry/resize, close
  and focus restoration, hidden-source rejection, tiny-editor cleanup and replacement
  protection. Electron adoption checks close an actual Neovim float and assert native
  document destruction. ADR 0016 records the decision.

## Verification

macOS arm64, Node 24.10.0, Neovim 0.11.4, Electron 44.5.0 / Chromium 152.0.7977.130:

- npm run check: exit 0, including build, all existing unit/runtime/worker checks and
  smoke:live. After adding hidden-source/tiny-editor assertions, test:providers exit 0.
- npm run smoke:electron: final exit 0, including both persistent/private adoption cases.
- Initial desktop/adoption/manual runs failed the private source-deletion assertion.
  Reproduced without plugins: Neovim 0.11 can leave the underlying noncurrent buffer
  intact when nvim_buf_delete is called with a float current. The fixture now focuses
  the actual source window, deletes it, and asserts deletion before awaiting cleanup.
  Ownership cleanup then passes. No production workaround or silent forced deletion.
- Inspected .local/review/presentation.png: rich content, local scope, cursor and Text
  ready visible. Interactive fixture: pasted into retained child, verified the value,
  clicked Finish review; float close/source close assertions then passed, exit 0.
  This verifies native input under float ownership, not integrated visual float layout.
- Existing intentional worker-failure/source-mismatch and macOS diagnostics remain.
- Packaged smoke not rerun in this slice; previous ownership-gate package evidence
  predates the float change. No dependencies, user profiles, accounts or remotes changed.

## Limits and next work

Float ownership is implemented internally. Native browser views still mount with
fixture rectangles; they are not yet fitted into Neovim float grids in production.
Next implement gate 2 resolved native placement, clipping/occlusion, trusted controls
and split/tab visibility. Gate 3 input/text integration and gate 4 automatic routing
follow. Explicit move-to-tab/split actions are also future work. Retain the source-
delete regression case when implementing host close commands; do not assume an RPC
success means the buffer disappeared. Linux, signed releases, real OAuth/devices/TLS,
security parity and prior acceptance gaps remain open.

## Follow-up: grid-derived placement


- Added native-child-placement: exact binding/session/window/grid checks, inward DIP
  rounding, border plus control-row reservation, viewport containment, ambiguous-owner
  rejection and hiding on overlapping foreground grids or trusted transient UI.
- NativePlacementGate hides on invalidation and rejects stale placement generations.
  Callers must invalidate before ownership/layout/viewport/UI changes are applied.
- Real-Neovim adoption fixture now derives browser bounds from float grids using
  declared test cell metrics. It checks occlusion by a real higher float, resize,
  hidden-tab parking, tab return and stale placement rejection without recreating pages.
- Fixed redraw translator: win_hide removes visible geometry but retains grid allocation
  dimensions. Neovim may restore a float without grid_resize. grid_destroy still clears
  dimensions. Added regression coverage; this bridge fix also applies outside the fixture.
- ADR 0017 records the conservative placement rules. Gate 2 remains partial.

## Verification

macOS arm64, Node 24.10.0, Neovim 0.11.4, Electron 44.5.0 / Chromium 152.0.7977.130:

- npm run check: final exit 0, including new placement/generation and hidden-grid tests,
  existing unit/runtime/worker/provider checks, build and smoke:live.
- npm run smoke:adoption initially passed placement/occlusion. Adding tab-return exposed
  the hidden-grid dimension bug; desktop and manual runs timed out before its fix.
- npm run smoke:electron after the fix: exit 0, persistent/private resize/occlusion/tab
  return and lifecycle assertions included.
- npm run smoke:package: exit 0 with native placement and sandbox assertions; existing
  unsigned/author/asar packaging warnings remain.
- Manual current fixture: native input accepted and displayed the pasted test value
  after resize and tab return; Finish review completed both session cases, exit 0.
- Inspected .local/review/presentation.png: local content, rich cursor and Text ready.
- Existing disposed-frame, intentional worker-error and macOS diagnostics remain.
- No dependency changes, real account access, commits, publishing or remote execution.

## Limits and next work

Production main still does not instantiate native ownership/placement. Fixture metrics
are declared values, not the production shell's measured font/zoom/stage metrics.
No trusted controls have been drawn in the reserved row. Single-border zindex=50
floats are the only accepted shape; split/tab promotion and arbitrary border insets
remain unsupported. Hiding whole views on overlap is deliberate conservative behavior.

Next wire production shell metrics and explicit layout generations to main, with
immediate invalidation on ownership/layout/resize/zoom/messages/menus and actual host
controls. Validate shell composition and DPI/zoom before enabling native routing.
Input/text integration and routing follow gates 3–4. Linux, signed releases, OAuth,
media/certificates, security parity and previous acceptance gaps remain open.

## Follow-up: production viewport transport


- Installed production shell-to-main viewport transport: reports measured stage origin,
  bounds and cell-ruler dimensions after rendering a main-owned layout generation.
- NativeViewportExchange validates generation, monotonic sequence, finite dimensions,
  content containment and main-owned zoom. Invalid current reports revoke the accepted
  viewport; old reports cannot restore it. DIP conversion scales stage coordinates once.
- Neovim state, host resize, shell loading/crash and explicit shell invalidation expire
  measurements. Shell stage resize/font zoom requests invalidation. Commands, completion,
  messages/history and command blocks report the viewport unavailable.
- Added matching typed/CommonJS preload endpoints with trusted-shell sender checks.
  No guest IPC, native handle selection or arbitrary rectangle attachment endpoint.
- Added unit tests and real production preload smoke assertions for acceptance,
  invalidation and expired-report rejection. ADR 0018 describes staging and limits.

## Verification

macOS arm64, Node 24.10.0, Neovim 0.11.4, Electron 44.5.0 / Chromium 152.0.7977.130:

- npm run check: exit 0, including new viewport tests, existing placement/lifecycle
  tests and build/smoke:live.
- npm run smoke:electron: exit 0, with production measurement transport assertions.
- npm run smoke:package: exit 0 with the same assertions and sandbox evidence.
- Inspected .local/review/presentation.png: rich local content, cursor, isolated scope,
  Text ready visible.
- Manual disposable production-shell fixture: app zoom and reset visibly updated the
  editor while viewport reporting was active; review button resumed the harness.
  The first review copy exhausted the normal 30-second automated timeout while paused.
  With its manual deadline extended, it passed the affected interaction and subsequent
  browser cases, then failed an unrelated copied-script relative path to source-viewer.
  This manual helper did not complete the full suite; standard desktop/package suites did.
- Existing intentional worker errors, disposed-frame/macOS diagnostics and unsigned/
  author/asar warnings remain; one development run also logged a GPU mailbox warning.
- No dependencies, user accounts, commits, publishing or remote execution changed.

## Limits and next step

NativeViewportExchange in production has an empty parking callback because there are
still no production native child views. It stores measured geometry but does not attach
views or render trusted controls. Renderer-only UI/CSS changes cross IPC asynchronously;
this is not yet an atomic composition guarantee. Neovim state changes currently invalidate
conservatively on every state update; assess flicker once a native subscriber exists.

Next connect an explicitly gated native child coordinator to ownership, viewport expiry
and placement, with trusted close/origin controls and coordinated render acknowledgements.
Ensure hiding precedes UI changes; verify resize/font/shell zoom/DPI, messages/menus and
source/child close. Then implement input/text before enabling normal popup routing.
Linux, signed release, real OAuth/devices/TLS, security parity and prior gaps remain open.

## Follow-up: gated production rich popup integration

Core/browser scope remains; non-browser plugins stay in separate repositories and
sessions. R1–R7 remain partial/release-blocked. Default popup behavior is unchanged.
`JUSI_NATIVE_POPUPS=1` now enables an actual rich popup inside the main app's Neovim
float, with trusted origin/scope and Close controls (ADR 0019).

NativePopupCoordinator connects retained Chromium children, NativeChildOwner,
measured viewport generations and grid placement. Native views remain hidden until
the trusted shell acknowledges the matching control token/generation. Tab hiding
retains page state; overlap parks views. Toolbar close and page window.close dispose
the float. Source navigation/crash/destruction revokes the child. No document host
API, navigation replay or arbitrary partition override was added.

## Verification and delegation

Substantial routine verification ran serially on one GPT-6 Luna/low agent with a
fresh brief, frozen code and no source edits. Primary diagnosed failures and did
live desktop acceptance. This standing workflow is in AGENTS.md.

macOS arm64, Node 24.10.0, Neovim 0.11.4, Electron 44.5.0 / Chromium 152.0.7977.130:

- npm run build and gated development popup fixture: exit 0
  (.local/review/native-build.log, native-integration-rerun.log).
- npm run check: exit 0 (.local/review/native-check.log).
- npm run smoke:electron: exit 0 (.local/review/native-smoke-electron-rerun.log).
- npm run smoke:package: exit 0, default and gated integration using the same
  packaged build (.local/review/native-smoke-package.log).
- Integrated assertions cover actual source Session/opener retention, sandbox/no
  Node/no host API, one app window, forged control rejection, hide/reattach retaining
  input and JS state, host resize, higher-float occlusion, toolbar and script close.
- Primary inspected .local/review/presentation.png: rich local content, cursor,
  isolated scope and Text ready visible. Electron's native-popup.png capture omits
  native child pixels on macOS; live CUA screenshot confirmed the actual child fits
  within the float below the trusted toolbar.
- Reusable manual fixture exited 0 (.local/review/native-manual-rerun.log): clicking
  the input and direct typing changed retained to retainedtest; trusted Close ended
  the fixture successfully. Clipboard paste timed out with no change. Do not claim
  paste/clipboard acceptance; investigate in the next input milestone.

Failures resolved: initial integrated placement stayed hidden because the persistent
one-line permit message was incorrectly treated as an overlay; that message lies
below the viewport and no longer blocks it. Standard smoke encountered a generation
change between measure and report: it now retries only when the generation actually
advanced, retaining failure for current-generation rejection. The first manual wait
expired during primary context handoff; one coordination retry completed. Existing
intentional worker diagnostics and unsigned package warnings remain.

## Limits and next step

Next implement bound native input/common rich-text dispatch and optional nonblocking
text, starting with focus/clipboard/IME behavior. Rich popup content currently has no
text layer; the surrounding source's Text ready badge does not apply to the popup.
Ctrl-Q and trusted Close exist, but common mode switching is unfinished. Block/error
feedback in the experimental coordinator is console-only. Integrated private flows
were not separately exercised here; older engine fixtures cover exact private Session.

Before enabling by default, finish atomic composition/zoom/DPI and focus acceptance,
assess conservative-invalidation flicker and exercise remaining source/child failure
paths end-to-end. Shell render acknowledgements alone are not an atomic composition
guarantee. Linux, signed release, real OAuth/devices/TLS and browser safety parity
remain open. Do not expand the Markdown fixture or create provider repositories here.

## 2026-10-03: macOS Edit menu

Standard native editing roles added in main.ts. Primary CUA review of the reusable
fixture verified Command-A, Unicode paste, undo, redo and trusted Close. Prior paste
timeout is resolved for native popup inputs. Full check, desktop smoke, manual
fixture and packaged smoke exited 0; logs `.local/review/edit-menu-{check,electron,
manual,package}.log`. No sub-agents. Copy/cut, IME and packaged manual editing remain
unverified; shared mode routing/text and release gates remain open.

## Latest slice: bound popup focus and mode routing

Native children now register with the shared Lua presentation lifecycle. Mode
requests carry the existing host reservation, buffer and incarnation; Lua validates
the original float and current tab before changing focus. Ctrl-\ then Ctrl-N returns
to the bound Neovim float; `i` returns to its visible native document. Ctrl-Q closes
that child. Rich content stays visible; optional popup text is still unimplemented.
See ADR 0020. No new document IPC or replayed navigation.

Primary-only verification, same macOS/Node 24 environment, all final checks exit 0:
- Focused build and Lua lifecycle tests; Lua covers forged token, hidden tab,
  closed reservation and exact window selection.
- Gated integration: `.local/review/native-input-focused.log`, native input chord
  to shell and Neovim `i` back to child, with retained input.
- npm run check: `.local/review/native-input-check.log`.
- npm run smoke:electron: `.local/review/native-input-electron.log`.
- npm run smoke:package: `.local/review/native-input-package.log`, including gated
  shortcut cycle in the packaged application.
- Manual reusable fixture: `.local/review/native-input-manual.log`. CUA clicked
  popup input, pressed Ctrl-\/Ctrl-N (shell focus observed), typed `i` (input focus
  restored), appended ` roundtrip` and verified retained value, then Ctrl-Q closed.
- Inspected `.local/review/presentation.png`: local content/cursor/scope/Text ready
  still visible. No sub-agents used.

During implementation, the new Lua test exposed missing shared lifecycle registration;
fixed with internal attach_native. The integration test initially used the wrong
preload method name, corrected to sendInput. A toolbar lookup raced the mode-triggered
redraw; fixture now waits for an available button before clicking. No blind reruns.

Next implement optional nonblocking popup text with revision cancellation and visible
status. Broader focus races, IME, multiple children, automatic initial focus and
composition/zoom/DPI acceptance remain; keep the flag opt-in. Older slices below
are historical where they describe mode switching as absent.


## Latest slice: optional native popup text (2026-10-05)

NativePopupText now runs the fixed browser extractor for each bound child, honoring
its inherited off policy. Rich attachment does not wait. The trusted popup toolbar
shows pending/building/ready/off/error. Text reaches the exact Neovim buffer through
existing validation and revision-checked publication; a 300 ms mutation poll rebuilds
it. Navigation, disposal and replacement reject late results. Operations time out
rather than leaving the status building indefinitely (ADR 0021).

Text refresh exposed native focus loss during temporary hiding. Validated return
requests and already-focused native views now retain focus through placement
acknowledgement, rechecking active window/incarnation; switching active windows
clears pending focus. Gated integration now asserts focus survives a text mutation.

Verification, primary only, macOS arm64/Node 24/Neovim 0.11.4/Electron 44.5.0:
- npm run check: exit 0, `.local/review/native-text-check-final.log`.
- npm run smoke:electron: exit 0, `.local/review/native-text-electron.log`.
- npm run smoke:package: final exit 0, `.local/review/native-text-package-final.log`;
  default and gated paths, including text publication, mutation, off policy,
  shortcut roundtrip and focus retention. This covers the final focus fix.
- Focused development fixture: exit 0, `.local/review/native-text-focus-fix.log`.
- Unit cases reject late extraction after navigation/close/replacement, perform no
  extraction when disabled and reject timed-out completion.
- Final reusable manual fixture: exit 0, `.local/review/native-text-manual-final.log`.
  CUA observed popup Text ready, appended ` verified`, confirmed Ctrl-\/Ctrl-N
  returned to Neovim, `i` restored input focus and Close completed the fixture.
  Earlier live screenshot showed the status within the trusted toolbar, above the
  rich child. `.local/review/presentation.png` still shows local content, cursor,
  isolated scope and Text ready.

Failures: first fixture toolbar lookup raced text-triggered redraw; it now waits
for available controls. Packaged tests exposed dropped return requests and then
loss of existing focus after a later redraw; both were fixed, with a focused
refresh assertion added. The interrupted earlier manual run did not complete;
it is not counted as a pass. Earlier package failure logs are native-text-package.log
and native-text-package-rerun.log. No sub-agents or blind reruns.

Next: popup cursor/selection projection and explicit retry. Text is present in
Neovim but the rich view still covers the text buffer, without cursor highlighting.
Extraction is cooperative in the guest renderer, not parallel worker execution.
Performance, cap reporting, shadow/frame coverage, IME, multi-window focus edges,
composition/zoom/DPI, Linux and release/security acceptance remain open. Keep the
native-popup flag opt-in. Older slices below are historical where superseded.



## Shared browser controller — 2026-10-05

ADR 0022 replaces the separate native text engine with the controller used by DOM
webviews. Both real adapters pass the same publication/mutation/error/retry/projection
conformance cases. The gated integration asserts a native cursor overlay after the
editor focus chord. Primary live review observed cursor movement and visual selection,
then rich input focus, retained typing and trusted close. Check, Electron smoke and
packaged smoke all exit 0; exact commands/logs are in STATUS.md. The initial manual
handoff timeout is not a pass; the restarted review completed. This is basic mapping
evidence, not Unicode, performance, IME or default-routing acceptance.
