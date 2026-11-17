// Reuse disposable-profile cleanup and the bounded Electron runner.
process.env.JUSI_TEST_ADOPTION_ONLY = "1";
await import("./run-smoke-electron.mjs");
