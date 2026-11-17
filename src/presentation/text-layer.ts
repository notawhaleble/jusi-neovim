import { TextLayerStatus } from "./contracts.js";

export class TextLayerLimitError extends Error {}

/** One generation per document. A replaced/disposed document cannot publish late work. */
export class TextLayerJob {
  private generation = 0;
  private controller?: AbortController;
  status: TextLayerStatus = "idle";

  constructor(private readonly changed: (status: TextLayerStatus) => void) {}

  invalidate(enabled = true): void {
    this.generation++;
    this.controller?.abort();
    this.controller = undefined;
    this.setStatus(enabled ? "idle" : "disabled");
  }

  fail(): void {
    this.invalidate();
    this.setStatus("error");
  }

  async run<T>(build: (signal: AbortSignal) => Promise<T>, publish: (value: T) => Promise<void>): Promise<void> {
    if (this.status === "disabled" || this.status === "building") return;
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.setStatus("building");
    try {
      const value = await build(controller.signal);
      if (generation !== this.generation || controller.signal.aborted) return;
      await publish(value);
      if (generation === this.generation) this.setStatus("ready");
    } catch (error) {
      if (generation === this.generation) this.setStatus(error instanceof TextLayerLimitError ? "limited" : "error");
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
  }

  private setStatus(status: TextLayerStatus): void {
    this.status = status;
    this.changed(status);
  }
}
