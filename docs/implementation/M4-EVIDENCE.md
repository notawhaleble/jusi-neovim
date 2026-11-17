# M4 evidence — profile selection and restart — 2026-10-01

Current scope: host/core and browser. Non-browser implementations remain in separate
repositories/sessions; Markdown is retained as conformance proof. No authoring skill
work until explicitly requested. M1 Linux acceptance stays open; M2, M3 and M4 are
in progress. M5 is deferred externally. R1–R7 remain partial/release-blocked.

## New in this session

- JusiWebProfile [name] selects the profile for subsequent web opens, or reports
  selected/current profiles. Existing presentations retain their accounts.
  Selection is process-local; setup/init.lua chooses the default on future launches.
- JusiWebPrivate[!] [URL] opens a fresh in-memory partition per presentation UUID.
  Parking/navigation retain the private session; new private buffers start fresh.
  Local documents retain their isolated local partition.
- Explicit privateBrowsing metadata passes from Neovim through the bridge/backend.
  Main enforces the existing guest sandbox/navigation rules for the new partition.
- Shell labels show Profile · name, Private · this buffer, or Local · isolated.
- Added two-process restart/isolation harness, Lua/partition tests, packaged private
  assertions, CI profile smoke steps, package documentation and ADR 0010.

## Validation

Node 24.10.0, Neovim 0.11.4, macOS arm64, Electron 44.5.0 / Chromium 152.0.7977.130:

- npm run check: exit 0 (unit, runtime/providers, native package conformance,
  workers/documents, existing Markdown tests and live Neovim).
- Build plus node scripts/run-smoke-profiles.mjs: exit 0, seed and restart processes.
  A loopback fixture's expiring HttpOnly cookie and localStorage survived normal
  Neovim/app exit without a test-only storage flush. Separate named profiles stayed
  isolated; private buffers started empty on reopen and after app restart.
- npm run smoke:electron and npm run smoke:package: exit 0. Private guest is
  nonpersistent and sandboxed; all existing presentation assertions pass.
- Inspected development/packaged presentation screenshots: local identity label,
  rich content, cursor and Text ready are visible.
- Manual: selected work, opened about:blank, selected personal while current buffer
  remained work, and queried both identities. Private open showed its label.
  i / Ctrl-backslash Ctrl-N / Ctrl-Q and :qa! worked; exit 0.
- Initial restart harness timed out because top-level await blocked Electron ready;
  moved asynchronous test work into main(). Another test read the outgoing guest;
  corrected the wait to require a new guest ID. Final runs pass.
- Expected worker failure/source-mismatch, disposed-frame, macOS task-policy and
  unsigned/author/asar warnings remain. Normal qa! can log RPC stream ended while
  completing the command, with process exit 0.
- CI steps added, not executed remotely. No dependencies changed, commits or publishing.

## Known limits

Restart evidence is a local fixture, not universal site/OAuth compatibility.
Session-only cookies, passkeys and browser-bound credentials are not covered.
Private means isolated in-memory browser storage: it does not erase Neovim registers,
downloads or OS traces; Chromium may retain private session memory until process exit.
No Chrome profile is imported. Profile clearing and permission revocation are absent.
Linux and packaged restart persistence (as distinct from packaged private smoke)
remain unverified. Browser security parity and release acceptance remain open.

Earlier DOM refresh limits remain: eventual polling, incomplete shadow/subframe/
CSSOM coverage, continuous-change readiness and unmeasured large-page performance.
Character/selection mapping and worker source-change negotiation remain incomplete.

## Next work

1. Scoped profile data clearing and permission listing/revocation, with explicit
   target identity, confirmation, active-guest handling and cancellation tests.
2. Browser navigation/OAuth popup mediation, origin display and OS-denial coverage.
3. Core text performance and Unicode character/selection mapping acceptance.
4. Custom trust/client identity and remaining device workflows; keep TLS verification.

See PLAN and requirements.json for full acceptance gates and platform evidence.


# Profile management evidence — 2026-10-01

Scope remains core/browser. Non-browser plugin implementations and authoring skill
remain deferred to separate requests/repos/sessions. M1 Linux gate is open; M2–M4
are in progress; M5 is deferred. R1–R7 remain partial/release-blocked.

## New in this session

- Added JusiWebPermissions, JusiWebRevoke and JusiWebClear, each requiring an explicit
  persistent profile name. Commands use a dedicated trusted Neovim host channel;
  no document or renderer IPC surface was added.
- Current HTTPS audio/video session grants can be listed. Revocation forgets the
  entire profile's grants and invalidates outstanding prompts. Navigation away/back
  also invalidates pending permission decisions.
- Clear/revoke refuse active pages, including parked tabs. Main reserves the profile
  during native confirmation/operation, prevents concurrent mutations and rejects
  new attachments. Existing Neovim buffers are never forcibly closed.
- Confirmation names the target and defaults to Cancel. Clear removes Chromium
  browser data, HTTP authentication cache and host grants, then closes connections.
  Success is reported only after completion; failure reports potentially partial
  clearing and releases the reservation.
- Added browser-profiles/media-permissions modules, unit tests, three-process profile
  harness coverage, package docs and ADR 0011.

## Validation

macOS arm64, Node 24.10.0, Neovim 0.11.4, Electron 44.5.0 / Chromium 152.0.7977.130:

- Final npm run check: exit 0, including grant/profile unit cases, providers, native
  packaging conformance, workers/documents, Markdown conformance and live Neovim.
- npm run smoke:profiles: exit 0 after channel fix. Final extended
  node scripts/run-smoke-profiles.mjs: exit 0 after adding attachment-race coverage.
  Three processes prove fixture login persistence, named/private isolation,
  active/parked refusal, cancellation preserving data, blocked new attachment,
  confirmed revoke/clear, cleared state after restart and another profile preserved.
  Native confirmation responses are stubbed only in the disposable test bootstrap.
- npm run smoke:electron: exit 0. Inspected .local/review/presentation.png:
  rich content, local scope, cursor and Text ready visible.
- Manual disposable app: inspected named clear dialog and clicked Cancel; saw
  cancellation feedback and empty grant listing. Active-profile revoke was refused
  with instructions to close buffers. Ctrl-Q and :qa! ended the process, exit 0.
- Initial profile integration failed because channel registration depended on
  clipboard setup. Fixed with dedicated explicit host channel initialization.
- Profile harness polling may log transient Lua assertion failures while awaiting
  async feedback; final assertions pass. Normal qa! may log RPC stream ended.
  Existing worker failure/source mismatch, macOS GPU/task-policy warnings remain.
- No dependency changes, user-profile clearing, real media access, commits,
  publishing or remote CI execution. Packaged smoke was not rerun for this slice.

## Limits

Management is whole named-profile scope, not per-origin or permission history.
Close profile buffers before mutation; a page opened during an operation is rejected
and must be closed/reopened afterward. Private/local reset is close/reopen.
Grant tests use simulated decisions/navigation; actual mic/camera, OS denials,
entitlements and adversarial iframe behavior still require platform validation.
Clearing is not forensic erasure, does not reset OS permissions/certificates, and
does not remove downloaded files or Neovim text/registers. Failures can be partial.
Packaged management/restart, Linux, general OAuth, signed release and browser
security parity remain unverified. Earlier text mapping/performance/DOM coverage
and worker source-change limits remain open.

## Next work

1. Mediated browser new-window/OAuth navigation and visible origin/popup feedback,
   preserving profile identity and guest isolation.
2. Media origin/OS-denial and packaged/Linux profile-management evidence; consider
   per-origin revocation and explicit live-page shutdown semantics.
3. Text performance and Unicode character/selection mapping acceptance.
4. Custom trust/client identities and remaining device workflows; retain TLS checks.

See requirements.json and PLAN for acceptance gates.


# Native popup evidence — 2026-10-01

Scope remains core/browser. Non-browser implementations and authoring skill remain
external/deferred. M1 Linux acceptance is open; M2–M4 are in progress; M5 is deferred.
R1–R7 remain partial/release-blocked. Earlier evidence is retained in M4-EVIDENCE.md.

## New in this session

- Added a source-scoped Allow next popup button: one attempt within 15 seconds.
  Unarmed, nested, local-document, unsupported-scheme and background-tab opens are
  denied with host feedback. Background opens require retrying a foreground action.
- Native auxiliary windows retain Chromium opener, redirect, postMessage source
  identity and window.close semantics, with the exact source profile/private Session.
  These are not Neovim presentations and have no text mirror; see ADR 0012.
- Children retain sandbox/context isolation, no Node/preload/host IPC, and existing
  navigation/permission checks. Host-controlled native title shows profile and origin;
  page title/geometry requests cannot remove that identity.
- One child per source. Source navigation, crash, close and host exit destroy it.
  Ctrl-Q closes the child; Ctrl-backslash Ctrl-N returns to current Neovim text mode.
- Added permit unit tests and shared development/packaged popup integration fixtures.
  CI artifact uploads include popup screenshots; remote CI has not been executed.

## Validation

macOS arm64, Node 24.10.0, Neovim 0.11.4, Electron 44.5.0 / Chromium 152.0.7977.130:

- npm run check: exit 0, including unit/runtime/provider/worker/document/package
  conformance and live Neovim tests.
- npm run smoke:electron: exit 0. npm run smoke:package: exit 0.
  Both exercise persistent and private popup sessions, cross-origin redirect and
  message/close handoff, no guest privileges, hostile window features, nested and
  unarmed denial, one-child limit, file-scheme refusal, source reload cleanup and
  about:blank inheritance. Packaged process sandbox evidence includes native popups.
- Inspected development presentation.png and packaged-presentation.png: rich page,
  local identity, cursor and Text ready visible. Inspected packaged-popup.png: the
  callback fixture rendered. Native title identity was separately inspected manually.
- Manual disposable loopback app: armed/opened child, checked host title, completed
  message/close with Done visible in rich page and text mirror. Verified child Ctrl-Q,
  Ctrl-backslash Ctrl-N focus return and source Ctrl-Q cleanup; :qa! exited 0.
- An early smoke failed because the mutation assertion preceded the polling-based
  revision advance after popup tests reloaded the source. The test now awaits the
  revision before checking stale-ticket rejection, matching the existing eventual
  refresh contract; production mutation code is unchanged. Final runs pass.
- Removed an empty preload option that produced Electron's absolute-path warning;
  the child supplies no preload. Expected worker-failure/source-mismatch, macOS
  task-policy and unsigned/author/asar packaging warnings remain.
- npm run harness and git diff --check pass. No dependency changes, real logins,
  user-profile clearing, publishing or commits for this slice.

## Limits

This is the explicitly discussed native fallback, not Neovim tab adoption. Popup
text layers and ordinary-link routing remain unimplemented. A one-use permit allows
that page's next request, not a proven user gesture. Background-tab opens are denied.
Closing or navigating the source destroys its child, including any unfinished form.
Real OAuth providers, OS media prompts, custom certificates, Linux, signed releases
and browser security parity remain unverified. Profile management/restart packaged
coverage is still open; packaged popup/session tests do not establish those claims.
Earlier DOM, performance, Unicode/selection and worker source-change limits remain.

## Next work

1. Ordinary new-link routing into Neovim-owned buffers/tabs; define child WebContents
   adoption/lifecycle before replacing the native fallback for opener-sensitive flows.
2. Real OAuth compatibility and media origin/OS-denial evidence; packaged/Linux profile
   management and per-origin permission history/revocation remain open.
3. Text performance and Unicode character/selection mapping acceptance.
4. Custom trust/client identities and remaining device workflows; retain TLS checks.

See requirements.json and PLAN.md for the full acceptance gates.


# Browser link tab evidence — 2026-10-01

Scope remains core/browser. Non-browser implementations and authoring skill remain
external/deferred. M1 Linux acceptance is open; M2–M4 are in progress; M5 is deferred.
R1–R7 remain partial/release-blocked. Earlier evidence is retained in M4-EVIDENCE.md.

## New in this session

- HTTP(S) links offer a native context-menu action, Open link in new Neovim tab.
  Lua creates the foreground tab and presentation buffer; the source remains open.
  URLs are RPC data, never interpolated into an Ex command.
- The new buffer inherits the source profile and text-layer policy. Named profiles
  share data. Private pages explicitly offer a fresh private session, following the
  existing per-presentation isolation policy. Native auth popups still share their
  source Session and opener; this new link action deliberately creates no opener.
- Main stores a single-use URL token, valid for five seconds after menu selection.
  Navigation, crash, destruction and another menu invalidate it. The trusted shell
  resolves explicit guest/buffer/session identity; main checks provider, readiness
  and partition; Lua checks incarnation before opening. Local/special URLs are excluded.
- Added browser-links module, host/preload/renderer integration, Lua tab creation,
  runtime and desktop/packaged acceptance coverage, user docs and ADR 0013.

## Validation

macOS arm64, Node 24.10.0, Neovim 0.11.4, Electron 44.5.0 / Chromium 152.0.7977.130:

- npm run check: exit 0, including unit/runtime/provider/worker/document/package
  conformance and live Neovim. Runtime tests cover stale source incarnation,
  literal URL data, profile/text inheritance and preservation of an edited buffer.
- npm run smoke:electron: exit 0. npm run smoke:package: exit 0, including a final
  tab-count assertion after close. Real host/shell/Neovim integration verifies link
  tabs, source return, named/private partition identity, inherited text settings,
  no native child/opener, and unchanged native popup cases. Native menu selection is
  stubbed only in automated fixtures. Forged/replayed tokens, navigation/destruction
  invalidation, unsupported schemes/control characters/oversized URLs are covered.
- Inspected .local/review/presentation.png: rich content, local identity, cursor and
  Text ready visible. Manual disposable loopback app: right-clicked a real link,
  selected the native menu, saw two tabs and new rich content plus completed text.
  Exercised i, Ctrl-backslash Ctrl-N, Ctrl-Q; source returned and Neovim reported one
  tab. :qa! exited 0. Temporary server stopped; no user profiles were modified.
- First runtime test tried tabclose after JusiClose had already removed the tab;
  removed the redundant operation. First private smoke assumed default profile;
  fixture uses work, so assertions now compare source metadata. Final runs pass.
- Existing disposed-frame diagnostics, intentional worker-failure/source-mismatch
  errors and unsigned/author/asar package warnings remain. They did not fail checks.
- No dependency changes, real logins, commits, publishing or remote CI execution.

## Limits

This action is a foreground fresh GET without opener/referrer forwarding. It does
not submit forms, intercept target=_blank or middle-clicks, create background tabs,
share private login with the new tab, or add a menu to native auxiliary windows.
Source changes before authorization completes discard the request. Popup text layers
and adoption of existing child WebContents are still open. Native popup restrictions
from ADR 0012 remain. Real OAuth, Linux, OS media, certificates, signed releases and
browser safety parity remain unverified. Earlier text/performance/worker limits and
packaged profile-management/restart acceptance remain open.

## Next work

1. Explicit guest adoption/lifecycle design for opener-sensitive Neovim tabs, then
   automatic ordinary-link/background routing without guessing document user intent.
2. Real OAuth and media-origin/OS-denial evidence; packaged/Linux profile management.
3. Browser history/reload/download/external-protocol UX and text performance/Unicode
   mapping acceptance; custom trust/client identities retain TLS verification.

See requirements.json, PLAN.md and ADR 0013 for acceptance gates and boundaries.


## Native-view capability gate — 2026-10-02

See [NATIVE-VIEW-EVIDENCE.md](NATIVE-VIEW-EVIDENCE.md) for isolated, desktop,
packaged and manual results. This gate does not enable production adoption.
