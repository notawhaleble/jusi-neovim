import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
const ledger = JSON.parse(readFileSync(new URL("../docs/implementation/requirements.json", import.meta.url), "utf8"));
assert.equal(ledger.schemaVersion, 1);
assert.deepEqual(ledger.requirements.map(item => item.id), Array.from({ length: 8 }, (_, i) => `R${i + 1}`));
for (const requirement of ledger.requirements) {
  assert.ok(["pending", "partial", "implemented", "verified", "blocked-release"].includes(requirement.status));
  assert.ok(requirement.evidence.length > 0);
  for (const path of requirement.evidence) assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), `Missing evidence: ${path}`);
  console.log(`${requirement.id} [${requirement.status}] ${requirement.title}`);
}
const ids = new Set(ledger.milestones.map(item => item.id));
const complete = new Set(ledger.milestones.filter(item => item.status === "complete").map(item => item.id));
for (const milestone of ledger.milestones) {
  for (const dep of milestone.dependsOn) assert.ok(ids.has(dep), `Unknown dependency ${dep}`);
  if (milestone.status === "complete") assert.ok(milestone.dependsOn.every(dep => complete.has(dep)), `Incomplete prerequisite for ${milestone.id}`);
}
const next = ledger.milestones.find(item => item.status !== "complete" && item.dependsOn.every(dep => complete.has(dep)));
console.log(`\nNext acceptance: ${next ? `${next.id} — ${next.title}` : "review release evidence"}`);
for (const item of ledger.milestones.filter(item => item.status === "in-progress" && !item.dependsOn.every(dep => complete.has(dep)))) {
  console.log(`Implementation in progress: ${item.id} — ${item.title} (prerequisite acceptance still open)`);
}
console.log("Read docs/implementation/STATUS.md. Checks: npm run check; desktop: npm run smoke:electron.");
if (process.argv.includes("--release") && ledger.requirements.some(item => item.status !== "verified")) {
  console.error("Release requirements are not all verified.");
  process.exitCode = 1;
}
