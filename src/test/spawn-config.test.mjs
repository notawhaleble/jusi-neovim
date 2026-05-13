import assert from "node:assert/strict";

import { buildNvimLaunchSpec, resolveExecutable } from "../../dist/bridge/spawn-config.js";

function testResolvesExecutableFromProvidedPath() {
  const resolved = resolveExecutable("sh", { PATH: "/bin" });
  assert.equal(resolved, "/bin/sh");
}

function testBuildLaunchSpecExtendsPath() {
  const spec = buildNvimLaunchSpec({
    command: "nvim",
    runtimePaths: ["/tmp/runtime-a", "/tmp/runtime-a", "/tmp/runtime-b"],
    clean: true,
  });

  assert.ok(spec.env.PATH?.includes("/opt/homebrew/bin") || spec.env.PATH?.includes("/usr/local/bin"));
  assert.deepEqual(spec.args.slice(0, 4), [
    "--embed",
    "--clean",
    "--cmd",
    "set runtimepath^=/tmp/runtime-a,/tmp/runtime-b",
  ]);
}

function testEscapesRuntimePathsForVimOptionSyntax() {
  const spec = buildNvimLaunchSpec({
    command: "nvim",
    runtimePaths: [
      "/Applications/Jusi Neovim.app/Contents/Resources/app/runtime",
      "/tmp/with,comma",
    ],
  });

  assert.equal(
    spec.args[2],
    "set runtimepath^=/Applications/Jusi\\ Neovim.app/Contents/Resources/app/runtime,/tmp/with\\,comma",
  );
}

testResolvesExecutableFromProvidedPath();
testBuildLaunchSpecExtendsPath();
testEscapesRuntimePathsForVimOptionSyntax();

console.log("spawn-config tests passed");
