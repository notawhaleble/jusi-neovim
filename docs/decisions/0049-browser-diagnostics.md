# ADR 0049: Opt-in browser incident diagnostics

Recurring fullscreen and link-placement reports require a timeline from normal
use. Synthetic acceptance and earlier scoped fixes cannot establish their cause.
`JUSI_BROWSER_TRACE` enables a main-process-only local recorder; normal runs do
not create log files or register diagnostic guest observers. Both browser adapters
share the recorder at their common input/fullscreen coordination points.

The trace binds events to explicit WebContents, session/incarnation and Neovim
window/tab/buffer/grid identities. It distinguishes permission probes from actual
fullscreen requests, captures prior host state and restoration decisions, and
records separate ordinary/modified mouse, mapped-link and menu routing paths.
Source extraction is untrusted; URLs are only run-local keyed hashes. Ordinary
key text/code, raw URLs, titles and page content are excluded. No guest IPC,
preload privilege, profile change or debugging network listener is added.

Files rotate through three 2 MiB slots per run, with a bounded queue and async
writes. Overload and disk failure are explicit. Failures disable diagnostics,
not browsing. A Neovim browser command emits a user marker, flushes the queue and
reports the directory; it does not alter navigation. Build hashes disambiguate
stale running code from a failure in a newly built checkout. Separate run folders
are retained; users control their cleanup.

See [debugging instructions](../browser/DEBUGGING.md) for the launch/mark/report
workflow and its privacy, rotation and forced-termination limits. This is
observability, not an alternate authority for input or fullscreen ownership.
