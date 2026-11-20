# jusi-neovim

A Neovim presentation host: ordinary editor grids and rich content share Neovim's
windows and tabs. Web browsing is the first provider; additional providers install
as normal Neovim packages. This is an experimental foundation, not yet a browser
with verified Chrome-equivalent safety or complete Markdown/PDF/EPUB viewers.

[macOS installation and quickstart](docs/MACOS-QUICKSTART.md)

```sh
npm install
npm run electron
```

Development launches store Electron data, including browser logins and editor
zoom, in `.local/electron-dev-profile/` under this checkout. The installed app
keeps its existing data in the platform application data directory. Both use
your normal Neovim configuration by default.

Requires Node.js 22.12 or newer, Neovim (tested with the installed version recorded in the handoff),
and a graphical desktop. Normal Neovim configuration loads by default;
`JUSI_NVIM_CLEAN=1` enables clean mode.

The host's Lua API is `require("jusi_neovim")`. The separate Jusi notebook plugin
keeps `require("jusi").setup(...)`; both can load in the same Neovim configuration.
Browser options use `require("jusi_web").setup(...)`.

- `:JusiWebBuffer https://example.com` — new rich buffer with asynchronous text.
- `:JusiWebBuffer! https://example.com` — text extraction off.
- `:JusiOpen provider target` — open an installed provider.
- `i` — enter rich interaction; `Ctrl-\ Ctrl-N` — return to Neovim navigation.
- `Ctrl-Q` or `:JusiClose` — close the presentation.

The text indicator reports completion and supports retry. Browser logins share a
named Jusi profile; Chrome profiles are not imported. Local HTML is restricted to
its opened directory and cannot load network resources. Configure the web profile
and other options through the [provider API](docs/provider-api.md).

[Architecture](docs/architecture.md) · [Review](docs/implementation/REVIEW.md) ·
[Implementation plan](docs/implementation/PLAN.md) · [Local alpha checklist](docs/implementation/LOCAL-ALPHA.md) · [Session handoff](docs/implementation/STATUS.md)

```sh
npm run harness          # requirements and next milestone
npm ci --prefix packages/jusi-markdown.nvim --ignore-scripts # optional viewer test dependencies
npm run check            # unit, Lua provider, asserted embedded-Neovim smoke
npm run smoke:electron   # real guests, isolated profile, local fixtures; needs desktop
npm run check:release    # intentionally fails until all requirements are verified
```

Set `JUSI_NVIM_CLIPBOARD=electron` to use Electron's system clipboard bridge for
Neovim's `"*` and `"+` registers. `JUSI_DEBUG_UI=1` enables diagnostic UI.

Packaged validation: `npm run smoke:package` builds and runs an unsigned test
package with the same application code and browser preferences. On Linux, run it
under `xvfb-run -a`. The test-only entry point is excluded from regular builds.
Reports and screenshots are saved under `.local/review/`; see
[packaged validation](docs/implementation/PACKAGED-VALIDATION.md) for scope and limits.


## Linux testing download

Use the portable **linux-x64 `.tar.gz`** asset on the existing
[test prerelease](https://github.com/notawhaleble/jusi-neovim/releases/tag/v0.1.0-test).
Extract the entire archive into a user-owned directory on a filesystem that permits
execution (for example `~/Applications/jusi-neovim`), then run the extracted
`jusi-neovim` executable. The download's `LINUX-TESTING-20261020.md` has exact commands and
checksums for that build. Keep the resources beside the executable.

This format needs neither FUSE nor AppImage extraction into `/tmp`. The old
AppImage is retained for reference. An `Operation not permitted` error under
`/tmp/appimage_extracted_*` can indicate execution restrictions; an archive avoids
that temporary launch path, but cannot override OS security policy.

Requires an x86-64 Linux graphical desktop with Electron's system libraries and
Neovim on PATH (development checks use Neovim 0.11.4). Electron and the browser
provider are included; Neovim is not. Use `JUSI_NVIM=/absolute/path/to/nvim` to
select it, or `JUSI_NVIM_CLEAN=1` for an isolated configuration test. Linux desktop
and sandbox acceptance remain open; these are experimental test downloads.

Build the portable artifact with `npm run dist:linux:portable:x64`. Existing
`dist:linux` / `dist:linux:x64` commands still build AppImages. The portable build
keeps Electron's sandbox settings; do not add `--no-sandbox` to work around a
separate sandbox startup error.

## Markdown test viewer

An optional independent package is available in
[packages/jusi-markdown.nvim](packages/jusi-markdown.nvim/README.md). It renders
local Markdown with headings, lists, tables and code; optional worker-thread text
extraction supports Neovim navigation and yanking. Images are placeholders and
HTML is escaped. Install/configure the package, then use `:JusiMarkdown path.md`
or `:JusiMarkdown! path.md` for rich-only viewing. It is not bundled automatically.

Development gate: `npm run smoke:adoption` exercises retained popup documents in
Electron native views using disposable profiles. It also runs inside desktop and
packaged smoke. This is a test fixture; production tab adoption is tracked in
[the native-view plan](docs/implementation/NATIVE-VIEW-PLAN.md).

Browser popups stay inside the app. Run `:JusiWebAllowPopup`, then repeat the
page action within 15 seconds. Use `:JusiWebAllowPopup!` to allow repeated
foreground opens while this page has browser focus. Reloading or navigating to
a new document clears the grant. The page can initiate these opens from scripts. The retained popup opens in a horizontal Neovim
split, shares its source Session/opener, and closes when its source navigates or
closes. No extra app frame is created. Use Ctrl-\ then Ctrl-N for Neovim focus,
`i` for browser input, and Ctrl-Q to close the presentation.

Ordinary clicks and Ctrl-J follow links in the current browser document, including
links with `target=_blank`. Cmd/Ctrl-click, middle-click, and text-mode Ctrl-N open
foreground Neovim link tabs. Link tabs inherit profile/text policy; private link
tabs start a fresh private session. Ctrl-O/Ctrl-I navigate browser history in rich
mode; Ctrl-L copies the actual current URL to the `*` register in either mode.
Profile and `Text ready` appear in Vim's statusline. Readiness disappears when the
mirror is stale. Bottom controls are available only with `JUSI_DEBUG_UI=1`.

Browser interaction uses shared link, scroll and click-to-cursor logic across both
transports. In Neovim navigation mode, Ctrl-J activates the link or control whose
text is under the cursor. Tab/Shift-Tab cycle scrollable text regions; Ctrl-E/Ctrl-Y
scroll the current region. Rich-mode Tab keeps normal browser form navigation.
Refresh restores the nearest matching line and cursor column. Text changes are
batched; thumbnail loads and paint-only animations no longer force text rebuilds.
Use `:JusiWebPause` to freeze automatic reparsing while reading a volatile page,
`:JusiWebResume` to enable it again, and `:JusiWebRefresh` for a manual rebuild
(including while paused). Pausing preserves the published text; stale DOM mappings
are still revoked. New page navigation builds an initial mirror. Textless/custom
controls and rewrapped anchors still have limitations. Visually clipped accessibility
labels are excluded from the visual mirror, including Wikipedia's “Jump up to”.

After building, a disposable interactive fixture is available with
`JUSI_TEST_NATIVE_POPUPS=1 JUSI_TEST_MANUAL=1 node scripts/run-smoke-electron.mjs`.
At its prompt, type in the popup and press Ctrl-Q within two minutes. This uses
local test pages and disposable profiles. Packaged smoke runs both default and
native integration cases.

### Clipboard

In rich mode (press `i`), use **Cmd-C / Cmd-X / Cmd-V** on macOS or
**Ctrl-C / Ctrl-X / Ctrl-V** on Linux to copy, cut, and paste in the page.
Add **Shift** to paste as plain text. Select page text to copy it, or focus an
editable field to paste. With the same platform modifier, **A** selects all,
**Z** undoes the last edit, and **Shift-Z** redoes it. Linux also accepts
**Ctrl-Y** for redo. In text mode, use Neovim's normal clipboard registers.

A Copy button on a focused, secure web page can write to the system clipboard
when you activate it. For example, use GitHub’s **Code → Copy** button and paste
the clone URL into an editor.

### Browser DevTools

Run `:JusiWebDevTools` in the browser buffer to toggle its detached Chromium
DevTools window. In rich mode, F12 does the same (some keyboards require Fn-F12).
This inspects the current document in either browser adapter. Close the tools
window normally, or repeat the command; closing the browser document also closes
its tools. DevTools can inspect and modify the page and its browser storage.

### Corporate HTTPS and private CAs

Use the platform CA store for corporate server trust. See
[private CA setup](docs/browser/private-ca.md) for macOS Keychain and Linux NSS
import, removal, persistence and troubleshooting. Trust applies across Jusi
profiles; Chrome-only certificate settings may require a separate import.

In browser text mode, press `'` to label visible text, then type a label to jump to that exact position. Each scrollable region gets priority, followed by headings and table cells, then other text blocks. Existing lowercase marks keep their usual jumps. Escape cancels.

Press **Ctrl-P** in a browser buffer (text or rich mode) to pause/resume automatic text building. `:JusiWebTogglePause` provides the same toggle; explicit `:JusiWebPause` and `:JusiWebResume` remain available.

To capture intermittent browser link/fullscreen failures, see
[Browser debugging](docs/browser/DEBUGGING.md). Opt in with `JUSI_BROWSER_TRACE`;
`:JusiWebDebugMark` marks the incident and reports its local log directory.
Ctrl-P immediately shows `Text paused` in the statusline while automatic text
building is paused.
