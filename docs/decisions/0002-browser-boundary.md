# ADR 0002: Browser security and profile ownership

Status: accepted boundary; browser parity is not certified.

Remote documents are untrusted, sandboxed Chromium guests with no Node, preload,
Neovim bridge, filesystem APIs or ability to create privileged child guests.
Only the application's own top-level shell may call privileged IPC. Guest
preferences and navigation are enforced in main, independently of DOM attributes.

A named persistent Jusi browser profile owns cookies/storage. Buffer IDs never
identify accounts. Existing logins in that Jusi profile should persist; importing
Chrome cookies/passwords or opening Chrome's live profile is not supported.
Authentication providers that reject embedded browsers need an explicit supported
flow, not user-agent spoofing or security switches.

Local presentation uses a separate in-memory session with a canonical filesystem
root derived from the explicitly opened file's parent or directory. Paths outside
that root and symlink escapes are rejected. Local sessions cannot use the network.
Network sessions have no local-file protocol. Root grants remain fixed for the
session. This intentionally restricts local HTML remote resources and external
links until a mediated handoff is implemented. It preserves raw HTML serving
inside the approved root.

Permissions default to deny. Initial camera/microphone support prompts from the
host for main-frame HTTPS origins and keeps grants only for the running session.
OS permission approval remains required. Other peripherals, screen capture,
persistent grants, revocation UI, origin display, download policy and OAuth
popups require dedicated implementations and tests before browser parity.

TLS uses Chromium validation. Custom trust must validate full chains, hostname,
expiry and intended usage. Do not implement custom CAs as `callback(0)` for a
hostname, an error-ignore switch, or a blanket certificate-error handler. Distinguish
CA trust from client identity certificates. Plan explicit profile-scoped trust
management where supported, otherwise a documented OS certificate store flow;
verify macOS/Linux behavior before promising support. See Electron's
[session APIs](https://www.electronjs.org/docs/latest/api/session).

R5 release gate: supported and patched Electron/Chromium, update delivery and
rollback, browser sandbox verification in packaged builds, adversarial fixture
suite, certificate and permission negative tests, external security review and
explicit supported-platform scope. Electron's
[support policy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)
means this is ongoing operational work.
