# ADR 0005: Shared descriptors and built-in backend code boundaries

Status: internal renderer lifecycle implemented; external SDK remains in M2.

PresentationSession and AttachedPresentation carry explicit buffer/session/window
identity and a normalized `{backend, uri}` surface descriptor. TextDocument carries
backend-independent lines and offsets; the web MirrorDocument specializes those
lines with DOM spans. Existing web wire names and URL fields remain compatibility
adapters. Document tickets and Neovim window/grid ownership remain authoritative.

BackendRegistry accepts compiled host backend definitions with an API version,
identifier and descriptor validator. The composition root in `src/backends/index.ts`
registers the web definition. Unknown backends and unsupported versions fail;
there is no dynamic import of provider-supplied JavaScript. This is a descriptor
registry, separate from the renderer lifecycle and future worker SDK. A new renderer backend
still requires an explicit host implementation, not merely adding an identifier.

The web backend owns DOM extraction/projection source in `document-scripts.ts`,
local preview rendering and protocol installation in `local-preview.ts`, and
browser partition naming in `partition.ts`. The shell coordinates jobs, tickets
and Neovim input; main enforces IPC, session, navigation and permission boundaries.
The document scripts execute in the sandboxed document, with no host IPC access.

Local preview retains the compatibility Markdown renderer and raw HTML/HTM serving.
This is not a feature-complete Markdown plugin. Protocol installation is synchronous
as required before guest attachment; failures reach the caller so attachment is
cancelled. A registered session's root cannot be replaced. Failed registration
is not cached as success. Root grants use canonical paths from the browser policy.

A hidden view clears projection without fabricating a window/session descriptor.
Generic source anchors, external provider action dispatch and external process
supervision remain explicit subsequent work rather than pretending DOM spans are
PDF or ebook coordinates.

## Renderer lifecycle

RendererSurface covers attach/detach, resolved pixel resize, focus/mode,
update/reload, extraction/projection/selection, links and disposal. The compiled
factory explicitly chooses an implementation. WebRendererSurface owns guest
creation, listeners and script execution. Detach parks the retained guest;
disposal removes its listeners and element. Navigation, reload, crash and disposal
invalidate pending results. Cancellation rejects extraction results without
terminating JavaScript already executing. Main revision tickets remain authoritative.

Linear offsets, MirrorDocument adapters and the Electron document handle remain
compatibility assumptions. Capabilities, source anchors and worker transport are
still incomplete; this internal interface is not a complete external backend SDK.
