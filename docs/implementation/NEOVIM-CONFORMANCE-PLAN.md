# Planned Neovim UI conformance pass

**Deferred by user direction on 2026-10-16.** Address the observed
[web-buffer issues](WEB-BUFFER-ISSUES.md) first, then resume this pass. Afterward,
define and execute the browser conformance boundary. This changes priority, not
completion status or the supported-version/platform evidence.

Remaining checklist on deferral:
- Float anchor/clipping/stacking compatibility; viewport/margins/extmark handling,
  external windows and msg_set_pos disposition.
- Language-map cursor highlights and inactive-window cursor behavior.
- Font/spacing, highlight/popup blending and mouse preference support decisions.
- Screenshot/error_exit, highlight semantic metadata, optional presentation events,
  newer reconnect/restart events and incompatible-secondary-UI recovery policy.
- Partial scrolling, fallback glyph clipping, alternate fonts, shaping/bidi/IME,
  overlay width/wrapping and cursor/mouse alignment acceptance.
- Minimum/current supported Neovim versions and Linux execution.
- Real Linux Jusi attention, sibling custom tabline overflow, actual Fugitive push
  diagnosis, and retained native focus/intermittent-integration observations.

The detailed event/option disposition remains in NEOVIM-UI-INVENTORY.md; optional
omissions require explicit decisions, not automatic implementation of every feature.
Manual review queue at deferral: 0/3. No automatic continuation of C4 until the
observed web-buffer queue is addressed or the user changes priority.

The scope is host/core and browser integration. Keep the existing architecture;
complete one coherent milestone per session, including error paths and evidence.
The review is [NEOVIM-INTEGRATION-REVIEW.md](NEOVIM-INTEGRATION-REVIEW.md).
This plan does not declare general GUI parity or close browser release gates.

| Slice | Scope | Acceptance | Status |
| --- | --- | --- | --- |
| C1 | Completed-frame publication; stable tab closure identities | Split redraws, interleaved metadata/lifetime revocation, multiple flushes, pending shutdown, stale viewport ack, separate live interaction reads; reordered/nonconsecutive tabs and surviving provider | Verified on macOS; open native-startup observation in STATUS |
| C2 | Native editor/tab mouse routing | Explicit grid press/release/drag/wheel, modifiers/multi-click; cursor and selection, split resize, tab click/close, overflow; no guest or overlay input leakage; both adapters | Verified on macOS (ADR 0034); native truncation policy documented |
| C3 | External command-line, messages and dialogs | Nested levels, byte/cell-correct cursor, highlighted chunks, confirm/input/error/history and streaming; completion position/selection; bounded message bytes | Verified on macOS across sequential source/package lanes (STATUS); focus delivery fixed; prompt group styling remains in C4 |
| C4 | Display fidelity and UI capability inventory | CJK/combining/emoji/font fallback, prompt group resolution, highlight decorations, cursor/coordinates, all enabled UI events classified; version/platform matrix | C4a verified on macOS; cursor race fixed and package lanes pass across sequential runs; combined review completed with native manual-focus follow-up (STATUS); C4b decoration/basic cursor slice implemented (ADR 0037); DOM click fixture now validates its current mapping ticket; default desktop passes (STATUS); prompt group resolution implemented (ADR 0038); blink/inversion implemented (ADR 0040); preference consumption and remaining inventory pending; option tracking/incompatible capability detection implemented (ADR 0039) |

C2 distinguishes Neovim's native tabline from a custom tabline's own fitting
policy. Neovim 0.11.4's built-in tabline truncates excess tabs rather than keeping
an active-tab viewport; the host preserves its cells and click targets. The sibling Jusi tabline's active-tab overflow fix belongs to its owning
repository/session. Linux attention reproduction still requires real pending
attention/configuration evidence; passing generic RGB rendering is not a diagnosis.

See [NEOVIM-UI-INVENTORY.md](NEOVIM-UI-INVENTORY.md) for the complete installed-version event classification and platform matrix.

## Protocol inventory baseline

The host requests rgb, ext_linegrid, ext_hlstate, ext_multigrid, ext_cmdline,
ext_popupmenu and ext_messages. It deliberately leaves ext_tabline disabled:
Neovim draws native/custom tabline cells on grid 1.

| Area | Current handling | Follow-up |
| --- | --- | --- |
| flush | C1 snapshots only completed frames | Cross-version/Linux acceptance |
| grid resize/line/clear/scroll/destroy | C4a preserves full cells/continuations and explicit run columns | Further scroll boundaries, shaping/font and platform coverage |
| hl_attr_define/default_colors_set | RGB attributes/defaults | Underline variants/strike implemented; blend and hlstate metadata remain |
| win_pos/float_pos/hide/close | Explicit grid ownership/geometry | C4 versioned float-anchor field coverage |
| mode_info_set/mode_change/cursor | Shape and grid position | Style disablement and busy suppression implemented; blink/inversion implemented (ADR 0040); language-map/focus remain |
| cmdline_show/pos/hide/special/block | C3 nested levels, UTF-8 offsets, chunk attributes and block argument shape | Prompt groups resolved (ADR 0038); broader font fidelity remains |
| popupmenu_show/select/hide | C3 measured external byte anchor, explicit grid placement, selection and info | C4 version/platform matrix |
| msg_show/clear/status/history | C0 display revisions; C3 dialog bypass, chunk attributes and retained byte bounds | C4 font/style wrapping and version matrix |
| option_set/title/icon/busy/mouse/bell | Options tracked; incompatible capabilities diagnosed; busy handled | Preference consumption and optional presentation limits in UI inventory |
| TabClosed runtime metadata | C1 handle reconciliation | C2 tab interaction cases |

## Verification policy

For each slice run affected focused workflows first, then npm run check. Run the
required desktop checks for input/focus/lifecycle changes; C1 also runs desktop
because frame boundaries affect browser/native placement. Runtime/preload/package
changes require package smoke. Save logs under .local/review and keep code frozen
during suites. Review saved screenshots only for changed appearance or a visual
concern. Do not duplicate meaningful automation with CUA; track the deferred UI
review queue and run the combined review at the defined checkpoint.

Minimum evidence matrix initially records Neovim 0.11.4 on macOS arm64. Minimum
supported-version policy and current-version/Linux coverage must be established
before broad compatibility claims. Real IME/OS dialogs remain separate manual
acceptance. Do not treat network/authentication push delay as a message renderer
failure without a reproduction.
