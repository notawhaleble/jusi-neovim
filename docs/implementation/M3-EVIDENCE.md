# M3 evidence — browser DOM refresh — 2026-10-01

Current scope is host/core and browser. Non-browser plugins belong in separate
repositories and sessions; retain Markdown as conformance proof without expanding
it here. The plugin-authoring skill is deferred until explicitly requested.

M0 complete. M1 remains open for Linux runtime/package evidence. M2 and M3 are
in progress; M5 implementation is deferred externally. R1–R7 remain partial or
release-blocked.

## New in this session

- Browser DOM changes automatically invalidate stale text and schedule a rebuild.
  Text, child replacement and layout attributes are observed, along with resize,
  resource load and font completion. Rich content remains available during rebuild.
- Guest indices and highlights are cleared immediately on observed changes;
  extraction is superseded. The shell polls a bounded counter approximately every
  300 ms, advances the existing main/Neovim document revision, and uses the existing
  250 ms refresh debounce. Old tickets cannot publish after revision advancement.
- Polling survives parked tabs; navigation, crash and disposal suppress old callbacks.
  Host decorations are filtered to prevent refresh loops. Initial text-off and
  worker-backed documents install no DOM watcher.
- Form controls and editable content are excluded from extraction. No new guest
  IPC is exposed. The change counter is treated as untrusted data.
- Added observer/surface tests, desktop regression cases, ADR 0009 and scope guidance.
  Existing Markdown provider implementation is unchanged.

## Validation

Node 24.10.0, Neovim 0.11.4, macOS arm64; Electron 44.5.0 / Chromium 152.0.7977.130:

- npm run check: exit 0, including unit, Lua/provider/worker, native installation,
  existing Markdown conformance and live Neovim tests.
- npm run smoke:electron: exit 0 after final watcher epoch guard.
- npm run smoke:package: exit 0, using the same desktop assertions in an
  instrumented unsigned packaged app.
- Desktop assertions cover mutation refresh, stale ticket rejection, equal-text
  node replacement, no projection refresh loop, parked-tab updates, excluded
  textarea values and no observer with text off. Existing lifecycle tests pass.
- Manual browser: clicked a button changing text to café 文 😀, observed Text ready,
  returned via Ctrl-backslash Ctrl-N, searched Updated and yanked the new text.
  Registers showed the exact Unicode string; the private textarea was not mirrored.
  Ctrl-Q and :qa! closed cleanly, process exit 0.
- Inspected final development and packaged presentation screenshots: rich content,
  text cursor and Text ready visible. Initial screenshot caught a legitimate late
  refresh as pending; capture now rechecks readiness immediately before capture.
- Expected worker extraction-failure/source-mismatch logs remain. macOS task-policy/
  GPU mailbox and unsigned/author/asar packaging warnings remain. No new dependency,
  publishing, commits or remote CI execution.

## Known limits

Refresh is eventual, not an atomic transaction across DOM, shell and Neovim.
Continuous changes or background throttling can delay readiness. Shadow DOM,
subframes, CSSOM-only changes and animations are not fully covered. Excluding
form controls does not hide secrets rendered as ordinary text. Large-page timing,
Unicode character/selection projection and complete layout coverage remain open.
Linux, signed release, guardian death/escaped groups and browser safety parity
remain outside verified evidence.

## Next work

1. Browser profiles: prove cookie/storage login persistence across process restart,
   expose profile/private selection and scoped clearing, then permission revocation.
2. Browser navigation/OAuth popup mediation and permission origin/OS-denial coverage.
3. Core text performance measurements and character/selection mapping acceptance.
4. Custom certificate trust/client identity workflows and remaining device support.
   Keep TLS verification enabled and use isolated test authorities.

Non-browser feature development and the authoring skill wait for separate requests.
See PLAN and requirements.json for full acceptance gates, including Linux evidence.
