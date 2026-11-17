# Capturing intermittent browser failures

From the repository root, launch your normal configuration with diagnostics:

```sh
PATH=/opt/homebrew/opt/node@24/bin:$PATH \
  JUSI_BROWSER_TRACE="$PWD/.local/review/browser-traces" npm run electron
```

Save your work and close the previous Jusi instance yourself before starting the
new one. This command builds current code and launches normal Jusi; it does not
use the smoke fixture or a fresh test browser profile. Omit `JUSI_BROWSER_TRACE`
to return to normal operation. Packaged launches accept the same environment
variable. A value of `1` chooses `browser-traces` inside the app's user-data folder;
a directory value chooses that location. `0` disables tracing.

Each run prints `[browser-trace] <directory>` on startup. A timestamp/PID/random
subdirectory separates runs. Keep the whole subdirectory when reporting a bug.

When an ordinary link opens a new tab, or leaving video fullscreen also leaves
host fullscreen:

1. In the affected browser buffer, leave rich input with Ctrl-\ then Ctrl-N.
2. Run `:JusiWebDebugMark`. It flushes a timestamped marker and displays the log
   directory. If a long path opens a message overlay, press Escape to dismiss it
   before continuing. If tracing is disabled or cannot write, it reports that instead.
3. Note what you clicked, whether any modifier was held, whether you had recently
   switched apps or fullscreen modes, and what should have happened. Do not
   include passwords or other sensitive page content.
4. Copy the run directory soon after the failure, or stop that debug run, so
   later activity does not rotate away the relevant events. Markers are ordinary
   entries in the same bounded log, not permanent snapshots.

Ctrl-P now redraws the Neovim statusline immediately after processing pause/resume.
`Text paused` is independent of page readiness, including late ready notifications
and manual refresh while paused. Resume shows `Text ready` when the published
state is ready, otherwise `Text auto`. Text-disabled buffers show `Text off`.

## What the log contains

- Exact build hashes and Electron/Chromium/Node versions.
- Host and guest focus/fullscreen events; permission checks versus requests;
  captured prior fullscreen state, owner identity, restoration flags and every
  host-fullscreen write from the browser coordinator/shortcut.
- Mouse phases, positions, historical keyboard modifiers and current trusted
  Chromium mouse flags, interaction epochs, collection cancellation, dispatch and
  returned buffer identities. Text-command and context-menu dispatch have
  distinct route labels. Popup permits log allowed/denied disposition separately.
- Neovim tab/window/buffer/grid identities when layout changes.
- Pause/resume command delivery, rich Ctrl-P requests, and extraction status.

No typed text, page text, screenshots, cookies, credentials, raw URLs, or key codes
for ordinary typing are recorded by this logger. URLs are correlated with a
run-local salted hash whose key is not saved; hashes cannot be compared across
runs. Modifier/control-key names and event timing are recorded. Logs stay local;
there is no upload or debugging network port.

A run retains at most three 2 MiB JSONL files and a bounded in-memory queue. Sort
records by `sequence` when reading rotated files; filename order is not time order.
Overload produces `trace.dropped` records. Write failure disables logging and
prints a warning without disabling browsing. Events flush about every 100 ms;
forced termination can lose the last batch. The marker command explicitly flushes.
Old run directories are retained until you remove them.

Tracing adds some timing overhead; a passing debug run does not establish a fix.
The Ctrl-O/lost-release link-routing case now uses current Chromium mouse flags
(ADR 0050); repeat the reported real-site workflow after restarting to validate it.
Ordinary video exits also exposed an Electron sibling-webview fullscreen defect.
The host now owns native window transitions explicitly (ADR 0044). Keep using
YouTube F, Escape, double-click or its fullscreen button; no OS shortcut is
required. Restart to load the fix; mark a new capture if it still recurs.
