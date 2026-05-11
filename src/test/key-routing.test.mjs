import assert from "node:assert/strict";

import { isTabKey, isWindowCommandFollower, shouldBlockShellAccelerator } from "../../dist/electron/key-routing.js";

function testWindowCommandFollowersCoverMoveAndResize() {
  for (const key of ["h", "j", "k", "l", "H", "J", "K", "L", "w", "W", ">", "<", "+", "-", "=", "|", "_"]) {
    assert.equal(isWindowCommandFollower(key), true, key);
  }
  assert.equal(isWindowCommandFollower("x"), false);
}

function testTabIsReserved() {
  assert.equal(isTabKey("Tab"), true);
  assert.equal(isTabKey("t"), false);
}

function testShellAcceleratorsAreBlockedConservatively() {
  assert.equal(shouldBlockShellAccelerator({ meta: true, key: "w" }), true);
  assert.equal(shouldBlockShellAccelerator({ meta: true, key: "q" }), true);
  assert.equal(shouldBlockShellAccelerator({ meta: true, key: "r" }), false);
  assert.equal(shouldBlockShellAccelerator({ meta: true, alt: true, key: "i" }), false);
  assert.equal(shouldBlockShellAccelerator({ meta: false, key: "w" }), false);
}

testWindowCommandFollowersCoverMoveAndResize();
testTabIsReserved();
testShellAcceleratorsAreBlockedConservatively();

console.log("key-routing tests passed");
