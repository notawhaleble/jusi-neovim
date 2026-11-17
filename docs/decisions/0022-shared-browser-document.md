# ADR 0022: Shared browser document behavior

Status: accepted; native popup presentation remains experimental.

Ordinary pages and retained popup documents use BrowserDocumentController. The
previous split between renderer orchestration and NativePopupText duplicated
document behavior because ordinary browser behavior was coupled to a DOM webview.

The shared controller owns optional text jobs, mutation polling, deadlines,
generation cancellation, bounded result validation, revision publication sequencing,
retry and cursor/selection mapping and caches. It exposes fixed browser operations
for projection, hit testing, scrolling and links. It imports neither Electron nor
host DOM ownership. The actual DOM and native adapters run the same conformance cases.

WebRendererSurface retains element attachment, events, geometry and focus. The
nativeBrowserDocument adapter supplies WebContents execution and main-process
publication authority. NativePopupCoordinator retains child ownership, placement,
visibility and focus, and forwards authoritative Neovim cursor/selection state.
These platform differences should not acquire independent extraction or mapping
implementations. Worker providers retain their distinct text transport.

Publication remains validated and revision checked in main and Neovim. The internal
transport is trusted host code; it adds no generic execution IPC or document API.
Rich content never awaits text. A timeout rejects results, not page CPU execution.

ADR 0023 subsequently integrates shared action dispatch and trusted retry described
as remaining below. This paragraph records the boundary at the time of this decision.

Basic native cursor/selection projection is integrated. Existing character mapping
limitations are preserved, not declared solved by consolidation. Native action
dispatch for links/scroll/hit testing and trusted retry UI remain integration work;
the shared operations alone do not establish feature parity. Broader mapping,
performance, focus/IME and composition gates remain in the implementation plan.
