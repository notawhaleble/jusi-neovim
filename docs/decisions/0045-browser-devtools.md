# ADR 0045: Explicit per-document DevTools

Status: implemented; verification recorded in STATUS.

`:JusiWebDevTools` toggles Chromium DevTools for the current browser buffer.
Unmodified F12 in rich mode uses the same shared dispatcher in both adapters.
The command validates the existing buffer/window/incarnation binding before
resolving the DOM or native WebContents. Tools open detached so their geometry
does not change Neovim layout. Guest destruction owns their lifetime.

Missing capabilities, destroyed contents or dispatch errors return unhandled;
the Neovim command reports dispatch failure. There is no new guest IPC, shell
inspector command or remote debugging listener. DevTools are an explicit user
capability and can execute page code and inspect profile storage.

Acceptance exercises command open/close, F12 opening, host-shell isolation and
closing the inspected document through both actual adapters. Shared unit cases
cover unavailable capabilities and exceptions. Linux and manual UI review remain
separate acceptance; see STATUS.

Electron API: https://www.electronjs.org/docs/latest/api/web-contents#contentsopendevtoolsoptions
