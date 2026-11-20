# ADR 0011: Named profile clearing and session grant revocation

Status: implemented; partial M4 acceptance.

JusiWebPermissions, JusiWebRevoke and JusiWebClear require an explicit persistent
profile name. Trusted Lua sends a notification on the dedicated host RPC channel.
No document or renderer IPC capability is added. Main validates the name/action,
resolves the partition and returns structured feedback to the package.

Mutations require zero live WebContents in the target session, including parked
guests. This avoids clearing under an active writer or claiming a media stream was
stopped by merely removing its grant. The user closes those buffers using normal
Neovim commands. Main reserves the profile during confirmation and mutation, blocks
new attachments (including late did-attach events), and rechecks before acting.
Concurrent operations fail visibly. Other profiles remain available. A rejected
new presentation must be closed/reopened after the operation; it is not auto-retried.

Native confirmation names the profile, defaults to Cancel and discloses scope.
Cancellation performs no mutation. Clearing invokes Electron clearData, clearAuthCache
and closeAllConnections, and revokes host grants. See the
[Electron session API](https://www.electronjs.org/docs/latest/api/session#sescleardataoptions).
There is no filesystem deletion, TLS change or OS permission reset. Failure is
reported as potentially partial; locks are released after operations settle.

Media grants are stored in a main-only session object. Listing returns current
HTTPS origins and audio/video grants. Revocation increments an epoch so outstanding
prompts cannot re-grant. Main-frame navigation invalidates a prompt even when the
page later returns to the same origin. Requests remain HTTPS/main-frame media only;
OS approval still applies. Unit fixtures cover the grant lifecycle, not real media
hardware, entitlements or full adversarial iframe behavior.

A site may query camera and microphone permission before calling
getUserMedia. Electron reports a missing grant as denied. The current browser
buffer exposes `:JusiWebAllowMedia` so the user can request both permissions
through the same origin-specific confirmation and session grant store. The host
takes the origin from the live guest. The command accepts no URL or profile
argument. Physical device availability still depends on the OS.

Private/local reset remains closing and reopening that isolated presentation.
Permission history, per-origin revocation with live-stream shutdown, OAuth, devices,
and certificate management are later work. Clearing does not promise forensic
erasure or remove exported files/Neovim text.
