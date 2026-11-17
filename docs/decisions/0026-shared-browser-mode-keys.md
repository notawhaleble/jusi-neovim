# ADR 0026: Shared browser mode keys

Status: accepted for mode chord interpretation; desktop acceptance recorded in STATUS.

Both browser transports use BrowserModeKeys for Ctrl-Q and Ctrl-backslash/Ctrl-N.
Each document owns an instance; the helper returns an action, while the adapter
performs the existing identity-checked close or mode transition. Native child
lifetime and DOM shell focus remain adapter responsibilities.

A prefix lasts 1.2 seconds. Modifier-only events and key releases preserve it;
an unrelated key cancels it. Composition cancels it without consuming the event.
Blur, full navigation and destruction reset state. Hidden native views also reset
pending input. The DOM adapter now resets its separate window-command prefix on
these boundaries and bypasses shortcut handling during composition.

DOM WebContents blur does not reliably report element focus loss. The trusted
shell forwards webview-element blur through a shell-only reset-browser-input call
for a registered guest. Native contents use their direct blur event. The reset
can only discard pending shortcuts; it cannot dispatch commands or change ownership.
No guest IPC is added. This unifies mode key interpretation, not all browser
accelerators or focus ownership. DOM reload/history/zoom/window commands still
need broader shared command acceptance. Synthetic composition tests establish only
non-interception, not real IME correctness. Real IME, cross-tab focus races and
platform-specific clipboard/keyboard behavior remain acceptance work.

ADR 0043 extends these reset boundaries to host BrowserWindow blur/focus. App
switching can retain guest focus and omit key-up; neither guest blur nor the shell
webview-element blur alone is sufficient. Mode selection is preserved.
