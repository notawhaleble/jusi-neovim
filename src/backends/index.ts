import { BackendRegistry } from "../presentation/backend-registry.js";
import { webBackend } from "./web/definition.js";

// This composition root is the only place that selects built-in backend implementations.
export const presentationBackends = new BackendRegistry();
presentationBackends.register(webBackend);
