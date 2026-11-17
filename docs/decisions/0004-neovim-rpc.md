# ADR 0004: Own the Neovim RPC transport

Status: implemented.

Use the maintained `@msgpack/msgpack` codec with a small typed transport implementing
Neovim's request, response and notification envelopes. The legacy
`promised-neovim-client` pulled vulnerable dependencies and converted extension
handle bytes to UTF-8. The host needs generic RPC, not an additional editor model.

Decode Neovim Buffer/Window/Tabpage extensions into validated numeric IDs at the
codec boundary. Text is decoded as Unicode by the codec. There is no redraw
pre-listener or geometry fallback. `EmbeddedNvimRpcClient` owns process launch,
handshake and bounded shutdown. The original exported class name remains an alias
for compatibility; the legacy npm package is removed.

Outgoing requests have a 30-second timeout and at most 1024 pending entries.
Writes are capped at 16 MiB including queued stream bytes. Decoder limits constrain
individual strings/binary values, collection lengths and extension payloads; these
are not an aggregate memory bound for arbitrarily nested messages. The transport
is private to the trusted embedded Neovim process, never exposed to documents.

Incoming handlers may await outgoing RPC without blocking the read loop. Replies
unwind the incoming request stack, as required by Neovim's RPC contract, with at
most 128 outstanding incoming requests. Handler failures return RPC errors.
