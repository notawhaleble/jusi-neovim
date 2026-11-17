# Jusi Markdown test viewer

An optional, extractable Neovim package for the Jusi presentation host. Opens a
local UTF-8 Markdown file in a sandboxed rich view. Text extraction runs on demand
in a separate Node worker thread; the rich page does not wait for it. This is a
test viewer, not feature-complete GFM or a browser security certification.

## Install locally

Requires the Jusi host runtime and Node >=22.12.0. Dependencies stay in this package:

```sh
cd /absolute/path/to/jusi-markdown.nvim
npm ci --ignore-scripts
```

Native Neovim packages: place this directory (including installed dependencies) in
`stdpath('data')/site/pack/jusi/start/jusi-markdown.nvim`. Configure before startup:

```lua
vim.g.jusi_markdown = { node = '/absolute/path/to/node', text_layer = 'auto' }
```

Or use lazy.nvim with a local checkout (no repository has been published):

```lua
{ dir = '/absolute/path/to/jusi-markdown.nvim', main = 'jusi_markdown',
  build = 'npm ci --ignore-scripts',
  opts = { node = '/absolute/path/to/node' } }
```

The host runtime must also be on runtimepath when setup runs. The provider resolves
Node from PATH by default; an explicit absolute path makes invocation reproducible.
For testing without installing, append this directory to runtimepath and call
`require('jusi_markdown').setup({node='/absolute/path/to/node'})`.

## Use

```vim
:JusiMarkdown /absolute/path/to/notes.md
:JusiMarkdown! /absolute/path/to/notes.md
```

Bang disables text extraction. `:JusiOpen markdown path` and the structured API
`require('jusi_neovim').open('markdown', path, {text_layer='off'})` also work. Arguments
are passed literally, without a shell. The file opens as an immutable snapshot;
close and reopen to read edits. Reload/retry rebuilds the same snapshot.

- `j`/`k`, search and other Neovim motions navigate extracted text and reveal blocks.
- `i` enters rich interaction; Ctrl-\ then Ctrl-N returns and restores the highlight.
- Ctrl-Q or `:JusiClose` closes the presentation and its worker.
- The host status button reports text readiness and retries extraction errors.

Open `examples/demo.md` to try headings, a table, code, Unicode and inert HTML.

## Scope and boundaries

Uses markdown-it 15.0.2 with raw HTML disabled. Supports headings, emphasis,
strikethrough, ordered/unordered lists, quotes, fenced/indented code, tables and
HTTP(S) links. Images display alt-text placeholders; no image or stylesheet fetches.
Local/fragment/non-web links are inert. No task-list checkboxes, math, syntax
highlighting, automatic file refresh, custom CSS, frontmatter interpretation or
character-accurate selection projection. External web navigation leaves this
snapshot; the host rejects mismatched worker text for that URL.

Text removes inline formatting, retains code, includes table cells and image labels.
Anchors are half-open byte ranges in the original UTF-8 file, including CRLF bytes.
Several lines/cells may share one block range; highlighting is at block granularity.
The file is limited to 1 MiB; extraction observes host 10000-line/512 KiB text and
bounded serialized-output budgets. An extraction error keeps rich content usable.
Invalid UTF-8, NULs, missing files and non-regular files fail startup.

The worker serves only a random loopback page/state path, not a filesystem root.
HTML is escaped, document resources are disabled, and CSP allows only the viewer's
nonce-bearing script. The page receives no Neovim IPC. This local trusted plugin
still has ordinary installed-code privileges; it is not a sandbox for plugin code.

## Tests

```sh
npm test
```

Host conformance additionally copies this directory to isolated native/lazy package
roots, and tests it in development and packaged Electron with optional text,
Unicode navigation and common mode keys. The host's production bundle does not
include this package or Node. Uninstall by removing its package-manager entry or
native package directory and restarting the host.
