import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export function linuxSandboxStatus(text) {
  const fields = Object.fromEntries(text.split("\n").map(line => line.split(/:\s*/, 2)));
  return {
    seccomp: Number(fields.Seccomp),
    filters: Number(fields.Seccomp_filters),
    noNewPrivileges: Number(fields.NoNewPrivs),
  };
}

export function assertLinuxSandbox(renderer, parent) {
  assert.equal(renderer.seccomp, 2, "Renderer must use seccomp filtering");
  assert.equal(renderer.noNewPrivileges, 1, "Renderer must prevent privilege escalation");
  assert.ok(Number.isInteger(parent.filters) && Number.isInteger(renderer.filters)
    && renderer.filters > parent.filters, "Renderer must add a filter beyond inherited container restrictions");
}

export function sandboxEvidence(app, contents, role) {
  const pid = contents.getOSProcessId();
  assert.ok(pid > 0 && pid !== process.pid, "Content must use a separate renderer process");
  const preferences = contents.getLastWebPreferences();
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.nodeIntegration, false);
  const evidence = { role, pid, preferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } };
  if (process.platform === "darwin" || process.platform === "win32") {
    const metric = app.getAppMetrics().find(item => item.pid === pid);
    assert.equal(metric?.sandboxed, true, `${role} must be sandboxed at OS level`);
    return { ...evidence, source: "Electron ProcessMetric", sandboxed: metric.sandboxed };
  }
  if (process.platform === "linux") {
    const renderer = linuxSandboxStatus(readFileSync(`/proc/${pid}/status`, "utf8"));
    const parent = linuxSandboxStatus(readFileSync(`/proc/${process.pid}/status`, "utf8"));
    assertLinuxSandbox(renderer, parent);
    return { ...evidence, source: "/proc/status", renderer, parent };
  }
  throw new Error(`No sandbox evidence collector for ${process.platform}`);
}
