# ADR 0008: Independent Markdown test provider

Status: implemented; local verification recorded in STATUS and M2 evidence.

Keep Markdown parsing and dependencies in packages/jusi-markdown.nvim, extractable
as a standalone Neovim repository. The host has no Markdown imports or production
bundle entry. Native packages and lazy.nvim configure its explicit Node invocation.
Use markdown-it with raw HTML disabled instead of maintaining a partial custom parser.

The worker reads one bounded UTF-8 file snapshot and renders rich HTML independently
of optional extraction. A separate worker thread parses readable text on extract;
cancellation terminates it. Rendering and extraction share token/source-range logic,
including original UTF-8/CRLF byte offsets. Compact paragraphs are rendered explicitly
so every extracted range has a visible target. Table cells share row ranges.

Serve only a random loopback document/state path. No directory serving or resource
resolution. Images are alt-text placeholders, non-HTTP(S) links are inert, and a CSP
restricts active content to the viewer script. Raw document HTML remains escaped.
The page has no host IPC. Worker-owned navigation checks tickets and sequence numbers.

This is a test viewer, not full GFM support. Feature scope, size budgets and install
instructions live in its README. Full format acceptance, live updates, images,
selection mapping and performance measurements remain future implementation work.
