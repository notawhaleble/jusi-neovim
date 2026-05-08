# jusi-neovim

Electron frontend for Neovim with first-class web buffers.

The target behavior is:

- Neovim still owns editing, modes, windows, tabs, and command flow.
- The UI still looks and behaves like fullscreen terminal Neovim by default.
- Some buffers can render as live web content instead of plain text.
- Those web buffers also keep a mirrored text representation so Vim motions,
  selections, yanks, and commands can operate on page content.

The project is intentionally not based on the old overlay model. Web content
should participate in the same composed scene as cmdline, popupmenu, floating
windows, and regular splits.

See [docs/architecture.md](/Users/niku/Documents/dev/jusi-neovim/docs/architecture.md).
