# ADR 0001: Neovim owns presentation buffers

Status: accepted foundation; backend migration tracked separately.

A presentation has a Neovim buffer, a provider identity, a rich session and an
optional text document. A window only attaches a surface. Closing a window may
park the session; deleting the buffer disposes it. Providers never infer editor
layout. Geometry without a known window/grid identity does not authorize drawing.

Providers install through Neovim packages (native packpath, lazy.nvim, etc.).
Each repository owns its Lua module, commands, configuration, assets, dependencies
and executable options. Registration uses a versioned Lua contract; configuration
remains in the user's Neovim setup. Unknown API versions fail explicitly. Core
supplies mode/close commands and text lifecycle. Do not build a second package
manager or load arbitrary provider code into the privileged shell renderer.

Initial surface descriptor: `{ backend = "web", url = "..." }`. This supports
providers serving browser-renderable content. It is not a native child-window
embedding protocol. Future backends must implement attach, detach, resize,
focus/mode, document revision, text capability, failure and dispose contracts.
No unsupported backend should silently fall back to the browser.

Text policy is `auto` or `off`. Rich content does not wait for extraction. Text
status is disabled, idle, building, ready or error; the host owns its visible
indicator. Jobs carry document generations and cannot publish after cancellation.
DOM access must remain in the document renderer and yield; CPU-only parsing for
PDF/EPUB belongs in workers. A promise alone does not make DOM traversal parallel.
Future generic mappings must distinguish DOM anchors, PDF page/glyph coordinates,
and ebook locations; do not force those into `domNodeId`.

Compatibility: `JusiWebBuffer` and internal `web-*` RPC names remain during
migration. `JusiWebBuffer!` disables extraction. `JusiOpen provider target` is the
shared entry point. API implementation and remaining limitations are documented
in `docs/provider-api.md`.
