import { presentationBackends } from "./index.js";
import { WebRendererSurface } from "./web/renderer-surface.js";
import type { AttachedPresentation } from "../presentation/contracts.js";
import type { RendererSurface, SurfaceEvents } from "../presentation/renderer-surface.js";
import type { MirrorDocument } from "../core/types.js";

/** Explicit trusted renderer dispatch; descriptor registration never implies a renderer. */
export function createRendererSurface(view: AttachedPresentation, events: SurfaceEvents): RendererSurface<MirrorDocument> {
  presentationBackends.resolve(view.surface);
  switch (view.surface.backend) {
    case "web": return new WebRendererSurface(view, events);
    default: throw new Error(`No renderer for backend: ${view.surface.backend}`);
  }
}
