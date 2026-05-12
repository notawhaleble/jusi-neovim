import assert from "node:assert/strict";

import { isTabKey, isWindowCommandFollower, shouldBlockShellAccelerator } from "../../dist/electron/key-routing.js";

function testWindowCommandFollowersAcceptSingleKeyWincmdTargets() {
  for (const key of ["h", "j", "k", "l", "H", "J", "K", "L", "w", "W", ">", "<", "+", "-", "=", "|", "_", "T", "r", "R", "x", "s", "v", "q", "o", "t", "b", "p", "P"]) {
    assert.equal(isWindowCommandFollower(key), true, key);
  }
  assert.equal(isWindowCommandFollower("ArrowLeft"), false);
  assert.equal(isWindowCommandFollower("Escape"), false);
}

function testTabIsReserved() {
  assert.equal(isTabKey("Tab"), true);
  assert.equal(isTabKey("t"), false);
}

function testShellAcceleratorsAreBlockedConservatively() {
  assert.equal(shouldBlockShellAccelerator({ meta: true, key: "w" }), true);
  assert.equal(shouldBlockShellAccelerator({ meta: true, key: "q" }), true);
  assert.equal(shouldBlockShellAccelerator({ meta: true, key: "r" }), true);
  assert.equal(shouldBlockShellAccelerator({ meta: true, alt: true, key: "i" }), false);
  assert.equal(shouldBlockShellAccelerator({ meta: false, key: "w" }), false);
}

testWindowCommandFollowersAcceptSingleKeyWincmdTargets();
testTabIsReserved();
testShellAcceleratorsAreBlockedConservatively();

console.log("key-routing tests passed");
