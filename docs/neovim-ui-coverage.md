# Neovim UI Coverage

This document tracks which Neovim UI events and editor actions the frontend
currently consumes. It is the checklist for deciding what must be handled
before adding richer rendering such as highlights and themes.

## UI Attachment

The embedded UI currently attaches with:

- `rgb`
- `ext_linegrid`
- `ext_hlstate`
- `ext_multigrid`
- `ext_cmdline`
- `ext_popupmenu`
- `ext_messages`

Unsupported UI extensions:

- `ext_tabline`: not consumed. Tab state comes from runtime metadata.
- `ext_wildmenu`: not consumed. Completion currently uses `ext_popupmenu`.
- `ext_termcolors`: not consumed.

## Redraw Events

Handled screen-content events:

- `grid_resize`
- `grid_clear`
- `grid_line`
- `grid_scroll`
- `grid_cursor_goto`
- `default_colors_set`

Handled geometry events:

- `win_pos`
- `win_float_pos`
- `win_close`
- `win_hide`
- `grid_destroy`

Known gaps:

- `hl_attr_define` is not consumed yet.
- `hl_group_set` is not consumed yet.
- `grid_line` highlight ids are currently ignored.
- `mode_info_set` and `mode_change` are not consumed yet.
- `busy_start` and `busy_stop` are not consumed yet.
- `flush` is not modeled as a render transaction boundary.
- True float clipping and border styling are still primitive.

Why these gaps matter:

- Highlights are required for syntax, themes, statusline colors, popupmenu
  selection, diagnostics, search, Visual mode, and cursorline.
- Mode events are required for cursor shape and mode-specific input feedback.
- Transaction boundaries will matter once rendering becomes more incremental.

## Cmdline, Popupmenu, And Messages

Handled cmdline events:

- `cmdline_show`
- `cmdline_pos`
- `cmdline_special_char`
- `cmdline_hide`
- `cmdline_block_show`
- `cmdline_block_append`
- `cmdline_block_hide`

Handled popupmenu events:

- `popupmenu_show`
- `popupmenu_select`
- `popupmenu_hide`

Handled message events:

- `msg_show`
- `msg_clear`
- `msg_showmode`
- `msg_showcmd`
- `msg_ruler`
- `msg_history_show`

Known gaps:

- Message rendering is intentionally minimal and terminal-like.
- Message history is rendered as an overlay but not yet polished.
- `msg_showcmd`, `msg_showmode`, and `msg_ruler` are parsed but not rendered as
  separate persistent UI rows in normal mode.
- Popupmenu styling ignores highlight groups until color support exists.

## Runtime Metadata

The runtime plugin emits:

- current tab
- tabs
- tab current window
- buffers
- buffer close
- windows
- window close
- web-buffer sessions
- web mirrors

Runtime autocommands schedule full snapshots for:

- `VimEnter`
- `TabEnter`
- `BufEnter`
- `BufFilePost`
- `BufAdd`
- `BufDelete`
- `WinEnter`
- `WinNew`
- `WinLeave`
- `VimResized`
- `WinResized`
- `WinScrolled`
- `WinClosed`
- `TabClosed`

Known gaps:

- Web-buffer lifecycle is still minimal: URL/title/navigation updates are not a
  first-class protocol.
- Window geometry is reconciled from redraw geometry and runtime metadata
  because the current RPC client can lose `win_pos` handle identity.

## Keyboard Actions

Renderer-focused input routes normal key events through `nvim_input`.

Reserved key behavior:

- `<Tab>` is reserved for Neovim from both host and webview focus paths.
- `<Esc>` is reserved for Neovim from the webview focus path.
- `Ctrl-W` starts a frontend-managed pending window-command prefix.
- `Ctrl-W h/j/k/l/H/J/K/L/w/W` route as `:wincmd` actions.
- `Ctrl-W >/</+/-/=/|/_` route as `:wincmd` resize actions.

Blocked shell accelerators:

- `Cmd-*` is blocked by default on macOS.
- `Cmd-R` is kept for reload.
- `Cmd-Alt-I` is kept for DevTools.

Known gaps:

- Reserved key policy is small and explicit, but not user-configurable.
- Browser text editing inside web forms will eventually need a clearer split
  between page-owned input and editor-reserved commands.
- Mouse resize is not implemented yet.
- Text-buffer mouse behavior is intentionally limited to focus.

## Mouse Actions

Handled:

- Clicking a text grid focuses that Neovim window.
- Clicking hidden web surface title/meta areas is no longer part of normal UI.

Known gaps:

- Split resizing by mouse is not implemented.
- Text click-to-cursor is intentionally not implemented.
- Floating-window mouse hit testing is not yet explicit.

## Web Buffer Actions

Handled:

- `:JusiWebBuffer {url}` marks the current buffer as a web buffer.
- `file:///path/to/file-or-dir` URLs are normalized before loading, with directories rendered through an internal listing page.
- Markdown files opened through the local-file viewer render as HTML instead of plain `<pre>` text.
- One persistent `webview` host is kept per web buffer.
- A web buffer attaches only to one visible window in the active tab.
- Hidden web sessions are parked instead of destroyed.

Known gaps:

- URL changes from inside the page are not yet fed back into app state.
- Page title updates are not yet fed back into app state.
- Web process lifecycle and crash handling are not modeled.
- Mirror text sync is still planned.

## Before Color Support

Color/highlight work should start with:

- model `hl_attr_define`
- model `hl_group_set`
- store highlight ids from `grid_line`
- render foreground/background/special colors
- render basic style flags: bold, italic, underline, undercurl, reverse
- apply highlight data to popupmenu selection and statusline cells

Color support should not start by hardcoding CSS classes for syntax groups.
Neovim highlight ids are the source of truth.
