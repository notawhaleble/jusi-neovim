# ADR 0006: Neovim-owned provider worker startup

Status: experimental readiness/lifecycle transport implemented on POSIX; macOS tested.

The installed Lua provider owns launch configuration; the Neovim runtime supervises
its worker. This keeps lifecycle ownership with the provider buffer and avoids a
new guest-to-main process-launch IPC. Installed executables are trusted native code,
not sandboxed documents. Parsing untrusted files safely remains their responsibility.

`jusi.worker(launch)` adapts a launch-options function to the existing provider open
callback. Launch requires an absolute executable, literal argv, absolute cwd and an
explicit replacement environment. No shell or implicit environment merge is used.
Workers receive a newline-delimited JSON hello version 1 on stdin and return one
ready frame on stdout, selecting supported capabilities and a web surface. The optional text.extract capability adds the request protocol in ADR 0007.
Only about:blank and HTTP(S) worker surfaces are accepted. Main browser policy still
validates navigation and sandbox settings. Documents do not receive this pipe.

Readiness defaults to 5 seconds, configurable from 1 to 60000 milliseconds. The handshake buffer is limited to 65536 bytes; unexpected frames, invalid JSON, unsupported versions,
capabilities and surfaces fail the worker. Stderr retains only the last 8192 bytes.
EOF, startup failure and process exit report bounded diagnostics through Neovim.
Late completion after provider close cannot attach a surface.

The runtime launches one guardian using the same Neovim executable with no user
init, plugins or shada. This avoids a new Python/Node requirement for installed
providers. Launch options travel over a private pipe (64 KiB cap), not command-line
arguments. The guardian owns the worker's dedicated POSIX process group and proxies
bounded output. It caps queued stderr at 8 KiB, dropping diagnostics under pressure;
the owner retains the last 8 KiB received. Workers remain trusted native code.

Closing the owner pipe, including after abrupt Neovim death, asks the guardian to
send `{"type":"shutdown","version":1}` and close worker stdin. Workers get 200 ms
to release resources, then the group receives SIGKILL. Worker leader exit also kills
remaining descendants before the process handle is released. No delayed signal is
sent after releasing that handle. The guardian exits after reaping the worker.
This request does not authorize writing user files or implement a save transaction.

The runtime invalidates callbacks immediately on close and keeps tracking guardians
until exit. VimLeavePre waits up to one second for concurrent guardian cleanup.
A guardian can finish independently after that wait. Parent-death tests cover
SIGKILL of Neovim, ordinary exit, and explicit close, with cooperative/unresponsive
workers and descendants. On Linux, orphan zombies require the OS init/subreaper to
reap them; the test distinguishes zombies from running processes.

The guardian itself must remain alive. Killing it, whole-process-group termination,
workers that daemonize/escape their group, and app death that leaves Neovim alive
are not covered by the parent-pipe guarantee. Linux runtime evidence, Windows job
objects and end-to-end worker document viewer integration remain open. The second provider is
a conformance fixture, not a complete document viewer.
