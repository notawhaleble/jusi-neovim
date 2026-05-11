# Architecture

## Purpose

This project is an Electron frontend for Neovim. It presents Neovim as a
native-looking full-window editor UI while allowing selected Neovim buffers to
render arbitrary web content.

The renderer keeps Neovim's windowing model intact. Web content is not an
overlay outside the editor; it is a composed surface owned by a Neovim buffer
and placed according to Neovim layout state.

## Source Of Truth

Neovim owns editor state. The frontend consumes that state and composes it.

- `grid_line`, `grid_clear`, and related redraw events own text grid contents.
- `grid_resize`, `win_pos`, `win_float_pos`, and related redraw events own grid
  geometry and stacking.
- Runtime metadata owns tabs, windows, buffers, current tab, current window,
  and web-buffer declarations.
- The bridge resolves `windowId -> gridId` before state reaches the renderer.

The renderer must not infer grid ownership from approximate matches such as
same size, same position, buffer id, or iteration order. If ownership is not
known, the surface is not rendered.

## Core Identities

There are three distinct identities.

`Buffer identity`: a logical Neovim buffer. A web buffer is still represented
as a Neovim buffer.

`Session identity`: the live browser state attached to a web buffer, including
URL, history, DOM state, scroll position, form values, JavaScript context, and
mirror mapping.

`Window identity`: the visible Neovim window that currently owns the
interactive surface for a buffer.

One web buffer may have one live browser session. That session may be attached
to at most one visible Neovim window at a time. If the same buffer is present in
another tab, the session is preserved and reattached when that tab becomes
visible.

## Composition Model

The UI is a composed scene of Neovim-driven surfaces:

- text grids
- web surfaces
- floating windows
- popupmenu
- cmdline and messages
- cursor and selection projections

Each surface has explicit bounds, clipping, z-order, focus behavior, and
hit-testing behavior. Browser content participates in this scene like any other
surface, so Neovim UI layers can appear above it when their z-order requires it.

## Web Buffer Contract

A web buffer has two coordinated representations.

`Live surface`: the interactive browser instance. It owns page navigation,
scrolling, form focus, JavaScript execution, and DOM inspection.

`Mirror text buffer`: the Neovim buffer contents used for Vim-native movement,
Visual selection, yanks/operators, Ex commands, and macros over page text.

The mirror is part of the web-buffer contract. It is not a decorative fallback
or a loose text dump.

## Mirror Mapping

The mirror map links Neovim buffer positions to page structure.

For each mirrored span, keep:

- mirrored text
- source DOM node identity
- DOM text offset range
- page-space rectangles for rendered fragments
- block or inline hints where useful

A linear text index can be derived from this structure, but it should not be
the only source of mapping truth.

## Interaction Model

Normal-mode editing remains Neovim-first.

When the mirror buffer is active, Neovim owns cursor movement and text
operations. The frontend projects cursor and selection state onto the live web
surface when possible.

When the live browser surface is active, the page owns DOM focus and form
editing. Reserved editor commands are routed back to Neovim through an explicit
input policy.

The browser surface is necessary for inputs, buttons, drag/drop, canvas
widgets, custom controls, and any interaction that cannot be represented as
plain mirrored text.

## Bridge Layers

`runtime/plugin/jusi_neovim.lua` emits tab, window, buffer, current-window, and
web-buffer metadata through `rpcnotify()`.

`src/bridge/notification-router.ts` routes raw Neovim notifications into
metadata, grid geometry, screen contents, and overlay state.

`src/bridge/redraw-translator.ts` normalizes multigrid redraw events into grid
bounds.

`src/bridge/layout-controller.ts` combines runtime metadata with redraw
geometry and web-session state. It resolves visible web attachments and window
grid ownership.

`src/bridge/screen-state.ts` stores grid text contents from redraw events.

`src/bridge/rpc-session.ts` defines the embedded Neovim session boundary used
by the Electron main process.

`src/renderer/app.ts` renders only resolved surfaces. It does not invent
window-to-grid relationships.

`docs/neovim-ui-coverage.md` tracks which Neovim UI events and editor actions
are currently consumed, intentionally ignored, or still unsupported.

## Launch Flags

Interactive Electron launches use clean Neovim mode by default for
reproducible debugging. Set `JUSI_NVIM_CLEAN=0` to launch embedded Neovim
without `--clean` and load the user's normal `~/.config/nvim` configuration.

Debug UI is disabled by default. Set `JUSI_DEBUG_UI=1` to show renderer
diagnostics and the full state dump.
