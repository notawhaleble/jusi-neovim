import { PRESENTATION_API_VERSION, type PresentationSurface } from "./contracts.js";

export interface PresentationBackend {
  readonly id: string;
  readonly apiVersion: number;
  validateSurface(surface: PresentationSurface): void;
}

/** Compiled host implementations only. Installed packages supply data, never shell JS. */
export class BackendRegistry {
  private readonly entries = new Map<string, PresentationBackend>();
  register(backend: PresentationBackend): void {
    if (backend.apiVersion !== PRESENTATION_API_VERSION) throw new Error("Unsupported backend API");
    if (!/^[a-z0-9_-]+$/.test(backend.id)) throw new Error("Invalid backend id");
    if (this.entries.has(backend.id)) throw new Error(`Backend already registered: ${backend.id}`);
    this.entries.set(backend.id, Object.freeze({ ...backend }));
  }
  resolve(surface: PresentationSurface): PresentationBackend {
    const backend = this.entries.get(surface.backend);
    if (!backend) throw new Error(`Unsupported presentation backend: ${surface.backend}`);
    backend.validateSurface(surface);
    return backend;
  }
}
