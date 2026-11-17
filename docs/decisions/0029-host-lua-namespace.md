# ADR 0029: Separate the presentation host's Lua namespace

Status: accepted.

The presentation host prepends its bundled runtime before the user's init runs.
Its former `lua/jusi/init.lua` therefore shadowed the independently installed Jusi
notebook plugin and broke `require("jusi").setup(...)` during normal startup.

The host owns `jusi_neovim` and its submodules. Bundled providers, runtime callbacks,
bridge Lua calls and conformance fixtures use that namespace. There is no `jusi`
compatibility alias: such an alias would retain the collision, including through
Lua's module cache. The notebook package and user configuration need no migration.
Providers targeting the old experimental host API must update their imports.

Commands, buffer metadata and private RPC names remain unchanged. They do not
participate in Lua module lookup. Web and Markdown provider modules retain their
existing `jusi_web` and `jusi_markdown` names. Earlier ADRs' `jusi` Lua references
describe the old spelling and are superseded by this namespace decision.

Package conformance loads a separate notebook fixture during user init with the
host runtime already prepended. It checks root/submodule separation, setup, native
and lazy.nvim loading, provider operations and close paths in the same process.
