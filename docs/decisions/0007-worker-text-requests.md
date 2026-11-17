# ADR 0007: Revision-aware worker text requests

Status: transport, automatic publication, visible status and line source navigation implemented.

Workers may negotiate `text.extract` alongside `surface.web`. Startup remains
independent of text work. The trusted runtime sends extract requests containing a
monotonic request ID and the existing full document ticket (bufferId, incarnation,
sessionId, revision). One extraction is active per worker; a new request cancels
its predecessor. Explicit cancel, timeout, buffer close and document invalidation
also cancel it. Late replies are ignored; cancellation after reply parsing but
before callback delivery still suppresses the result. Cancellation is cooperative:
a worker may continue computing, but cannot deliver the cancelled document.

The guardian proxies request data through bounded pipes. The owner validates
responses and reconstructs a data-only document. Each line has UTF-8 text and an
opaque source anchor {source, startByte, endByte}. Offsets are half-open byte ranges
in the named provider source, not DOM positions or UTF-16 string indices. The host
does not interpret source names as paths/URLs or execute/open them. Structural
validation cannot prove that an anchor matches the underlying source.

Limits: 64 KiB launch/handshake buffer; 1 MiB ready-state receive buffer and guardian
output queue; 64 MiB lifetime stdout; 64 KiB guardian input queue and 64 MiB lifetime
request traffic. Documents have at most 10000 lines and 512 KiB aggregate text;
source IDs are at most 1024 bytes. Invalid UTF-8, NULs, embedded newlines, invalid
ranges and oversized documents are rejected. Request timeout defaults to 10 seconds
(configurable 1–60000 ms). These are experimental caps, not performance guarantees.

`jusi.extract(ticket, callback)` requires an active managed provider, negotiated
capability, text enabled and the current Neovim document ticket. It rechecks identity
before delivering the result. Accepted `jusi.document.invalidate` calls cancel the
old request. Text-result errors leave the rich worker running. Framing/protocol
violations still fail the worker. No result is automatically committed to a buffer.

## Automatic host integration

A managed provider negotiating text.extract registers textSource=worker. Other
providers retain DOM extraction. This choice persists while a view is parked.
The shell uses its existing text job/status button, obtains a main-issued document
ticket, then asks main to build worker text. Main starts a nonblocking Lua request;
Lua replies through the host's explicit private RPC channel. The bridge correlates
at most 32 requests, bounds their lifetime to 61 seconds and clears them on exit.
It revalidates returned documents at the process boundary.

Main checks current revision before serializing publication through the existing
DocumentRevisions queue. Neovim checks incarnation/revision immediately before
writing the read-only buffer. Ready appears only after acceptance. Worker source
anchors remain in a separate workerText field; no compatibility MirrorDocument or
DOM spans are invented. Invalidation clears both kinds of cached text. Text errors
leave rich interaction available, and the status button retries. Text-off skips work.

Worker extraction currently requires the guest URL to exactly match the declared
normalized session URL. Navigation elsewhere reports text failure instead of
publishing the old worker source over another page. Redirects and source-change
negotiation require a future explicit contract. Main rejects DOM-mirror publication
for worker-backed sessions.

## Optional source navigation

Workers may negotiate `source.navigate` only alongside `text.extract`. After an
atomic successful commit, Lua retains the validated document and ticket. Current
Neovim cursor/window events select that line's whole source range. A 20 ms debounce
coalesces motions and identical window/ticket/anchor updates are deduplicated.
Cancelled callbacks cannot replace newer timers. No character offsets are guessed.

The worker receives `{type:"navigate",sequence,ticket,windowId,anchor}`. Sequence
increases for the worker lifetime; anchor is the original source range or null to
clear. Workers must reject stale tickets/sequences and interpret anchors against
their own sources. The host neither opens source names nor executes their contents.
There is no reply and no new document-to-Neovim channel. Input queue remains 64 KiB;
lifetime request traffic is now 64 MiB to accommodate navigation.

Window/buffer leave, invalidation, disposal and rich-mode entry clear projection.
The trusted shell reports rich/text transitions with session, buffer and window
identity through a shell-only IPC method. Main validates the attachment/session;
Lua checks buffer incarnation and the window's buffer. The Neovim i mapping marks
rich mode immediately, before asynchronous shell focus. Native surface focus also
reports rich mode. Lua suppresses cursor and commit-triggered projection while rich
mode is active; returning to text schedules the current line without a cursor move.
Leaving the window resets its rich state. No guest receives the mode IPC API.
This remains line navigation, not character selection or click-to-text mapping.
ADR 0046 extends this with an optional returned-line cursor byte for providers that
own word/character geometry. The original source range semantics remain unchanged.

The extractable source-viewer fixture uses a loopback page and worker-owned source
IDs, without importing host implementation or receiving host IPC in the guest.
It validates conformance for two fixed paragraphs, not a complete document format.
