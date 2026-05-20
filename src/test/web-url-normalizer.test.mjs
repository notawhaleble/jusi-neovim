import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { normalizeWebSessionUrl } from "../../dist/bridge/web-url-normalizer.js";

function testLeavesNonFileUrlsUnchanged() {
  assert.equal(normalizeWebSessionUrl("https://example.com/a b"), "https://example.com/a b");
  assert.equal(normalizeWebSessionUrl("/tmp/plain-path"), "/tmp/plain-path");
}

function testEncodesFileUrls() {
  const root = mkdtempSync(join(tmpdir(), "jusi-file-url-"));
  try {
    const filePath = join(root, "name with space.html");
    writeFileSync(filePath, "");
    const expected = new URL("jusi-directory://open/");
    expected.searchParams.set("path", filePath);

    assert.equal(
      normalizeWebSessionUrl(`file://${filePath}`),
      expected.href,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function testAddsDirectoryTrailingSlash() {
  const root = mkdtempSync(join(tmpdir(), "jusi-file-url-"));
  try {
    const withoutSlash = pathToFileURL(root).href.replace(/\/$/, "");
    const expected = new URL("jusi-directory://open/");
    expected.searchParams.set("path", root);

    assert.equal(
      normalizeWebSessionUrl(withoutSlash),
      expected.href,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function testPreservesSearchAndHash() {
  const root = mkdtempSync(join(tmpdir(), "jusi-file-url-"));
  try {
    const filePath = join(root, "missing.html");

    assert.equal(
      normalizeWebSessionUrl(`${pathToFileURL(filePath).href}?q=1#section`),
      `${pathToFileURL(filePath).href}?q=1#section`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

testLeavesNonFileUrlsUnchanged();
testEncodesFileUrls();
testAddsDirectoryTrailingSlash();
testPreservesSearchAndHash();

console.log("web-url-normalizer tests passed");
