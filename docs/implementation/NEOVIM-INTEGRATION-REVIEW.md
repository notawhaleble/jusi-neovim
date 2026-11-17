# Neovim integration review — 2026-10-15

## Assessment

The architectural foundation is useful: private MessagePack transport with typed
handles, explicit window/grid ownership, Neovim-rendered native tabline/statuslines,
and shared grid highlight rendering. A rewrite is not indicated. However, this is
not yet a conformant general-purpose Neovim GUI. Plan a bounded UI protocol and
input conformance milestone instead of relying exclusively on reported symptoms.
This is a source review plus scoped macOS runtime tests, not exhaustive plugin or
Linux acceptance.

## Reported issues

### Reappearing command output — host defect, fixed (ADR 0032)

The renderer previously dismissed a whole-message signature containing the global
message version. New undo/redo or other messages changed that version while old
multiline entries remained in the bridge, resurrecting the old pager. Every update
also reset its scroll position. Escape/q hid even a real return prompt locally
without acknowledging it to Neovim. Prompt-looking document text was treated as a
prompt through a regex.

Display revisions now distinguish new output from dismissed output. Streaming
starts at the bottom and preserves scrollback. Real return prompts receive the
dismissal key. Desktop acceptance covers streaming, a scrolled-back update,
Enter, undo/redo and tab changes, repeated identical output, and real :! shell
return prompts dismissed by Enter and Escape. This reproduces the host lifecycle,
not a network Git push or Fugitive authentication; a slow push itself remains
undiagnosed and may be transport/credential/hook related.

### Attention colors — Linux report remains unresolved

The host does not enable ext_tabline and has no independent HTML tab strip.
Neovim sends tabline cells and highlights on grid 1. A probe loaded the actual
sibling ../jusi/lua/jusi/attention_tabline.lua with a mocked attention summary,
and observed JusiTabAttention's #e5b454 background and the !1 badge in the real
host bridge. An Electron fixture verifies that tabline colors appear, change on
highlight redefinition, and disappear on restoration. Saved screenshot confirms
appearance. These checks pass on macOS; they do not prove Linux behavior or real
attention event delivery.

Jusi deliberately installs its attention tabline only when 'tabline' is empty.
An existing custom tabline owns its own attention integration. Inspect the Linux
build, pending attention summary, :verbose set tabline?, :set showtabline?, and
:verbose highlight JusiTabAttention before adding a host workaround. No sibling
repository code was changed.

### Overflow — separate native drawing and input limitations

Jusi's custom tabline concatenates every label and has no active-tab viewport or
%< truncation placement. Neovim's statusline formatting truncates that string; this
is separate from the built-in empty-'tabline' tab strip. C2 verified that Neovim
0.11.4's built-in strip also truncates excess tabs without an active-tab viewport.
A real-Neovim 60-column probe with ten tabs confirmed that switching to the
first tab leaves labels 7–9 in the custom tabline; clearing attention restores
the built-in tabline. The host cannot scroll cells Neovim did not send. Test native and custom tablines
separately; implement selected-tab-aware fitting in the owning tabline, with
Unicode display widths and close/click targets preserved.

C2 (ADR 0034) adds the previously missing explicit-grid nvim_input_mouse path:
editor press/release/drag/wheel, modifiers, Neovim multi-click handling, native
tab click/close and custom callbacks. This repairs input delivery; it does not
add a tabline viewport or change the cells supplied by Neovim/Jusi.

## Findings and disposition

C1 now addresses original findings 1–2 through ADR 0033, with macOS evidence in
STATUS. It also separates live interaction reads from completed presentation
frames. The numbered descriptions below retain the original diagnosis; items
3 is addressed by C2/ADR 0034; 4–6 remain in C3–C4 of
NEOVIM-CONFORMANCE-PLAN.md. An initial native-popup control
timeout remains unconfirmed despite later passing source/package acceptance.

1. **High: redraw publication ignores flush boundaries.** The router applies
   batches and the session schedules state emission on a zero-delay timer without
   checking flush. Neovim explicitly permits a frame to span multiple redraw
   notifications and requires displaying only the flushed state. A timer is not
   that boundary. Stage redraw state until flush; test split batches interleaved
   with metadata, including native viewport invalidation and late acknowledgments.
2. **High: TabClosed confuses tab number with handle.** runtime/plugin/jusi_neovim.lua
   sends tonumber(args.match) as tabId; Neovim documents that value as a tab page
   number, while all other tab events use nvim Tabpage handles. After tabs have
   been closed/reordered these diverge. Reconcile known handles against
   nvim_list_tabpages on close and test nonconsecutive IDs, reordered tabs and
   surviving windows/providers. The current visible snapshot limits some exposure;
   it does not make deletion by the wrong identity correct.
3. **High: editor mouse conformance is missing.** Implement press/release/drag,
   wheel, modifiers and multi-click through nvim_input_mouse with explicit grids,
   including grid 1 chrome and native tab clicks. Preserve guest routing and
   overlay/pager interception. Exercise both browser adapters at their boundaries.
4. **Medium: external command-line/dialog protocol is partial.** A single cmdline
   object loses nested levels; chunk highlights are flattened; command positions
   are byte offsets but the renderer indexes JS strings. Completion/info and
   confirm/input prompt variants need tests. Six-field cmdline_show and
   msg_history_clear are fixed here, not the entire subsystem. Message storage
   caps entry count, not bytes within a streaming entry.
5. **Medium: display-cell and highlight fidelity is partial.** Grid code retains
   Neovim cells, but HTML run rendering and command wrapping use JS string lengths
   in places. Test CJK, combining marks, emoji, tabs and font fallback against the
   cursor and mouse coordinates. Highlight decoding omits strikethrough and newer
   underline variants. Do not extrapolate ASCII/single-font evidence to full parity.
6. **Medium: declared UI capabilities need an event inventory.** Audit every
   enabled extension and advertised version against implemented events. Include
   option_set, title/icon, busy/mouse state, popup/menu geometry, floating anchors
   on supported Neovim versions, and restart invalidation. Explicitly classify
   optional ignored presentation events versus mandatory state transitions.

## Proposed next milestone and acceptance

First fix flush publication and tab handle reconciliation, with raw protocol and
live-Neovim regressions. Then implement native mouse/tab interaction and test
native overflow independently from custom tabline formatting. Finally finish
external cmdline/message/dialog conformance or deliberately reduce enabled
extensions where rendering ownership can safely return to Neovim.

Use a versioned protocol matrix with the minimum supported and current Neovim,
macOS and Linux. Include actual user config/Fugitive/Jusi integration, no network
push required for deterministic streaming cases. Require native tabline default,
custom highlight update/reset, many long labels, active-tab visibility, clicks,
wheel and reorder/close identity cases. Retain separate real IME/OS-flow gates.

Protocol reference: [Neovim UI events](https://neovim.io/doc/user/api-ui-events/).
Installed Neovim's runtime/doc/ui.txt and autocmd.txt were also read for the actual
local version's event shapes, flush contract and TabClosed semantics.
