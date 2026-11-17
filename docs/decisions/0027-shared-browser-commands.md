# ADR 0027: Shared reload, history and zoom commands

Status: implemented; verified acceptance is recorded in STATUS.

Both Electron browser adapters interpret and dispatch reload/history/zoom using the
same browser-commands module. Ctrl/Cmd-R reloads, Ctrl-O goes back, Ctrl-I or Ctrl-Tab
goes forward, and Ctrl/Cmd plus/minus/zero changes or resets document zoom. Physical
codes retain layout-independent handling. Composition, Alt-modified and key-release
events are not interpreted as commands.

The shared dispatcher consumes WebContents capabilities, using navigationHistory for
back/forward and the existing 0.3–3 zoom bounds with 1.1 steps. History boundaries are
handled no-ops. Missing capabilities, destroyed contents and dispatch exceptions
return unhandled; adapters consume an event only after successful dispatch. The DOM
shell's separate accelerator policy still applies to otherwise unhandled keys.

Adapters retain focus/visibility and projection notification responsibilities. DOM
zoom uses the existing shell notification; native zoom resets and reprojects its
shared document controller. Both rely on shared resize/reflow tracking for extraction;
the DOM adapter no longer schedules a redundant delayed forced rebuild that could
outlive navigation and reset the new cursor. Reload uses normal navigation invalidation and text
rebuilding. No URL replay, guest IPC or profile/Session changes are introduced.

Shell UI zoom remains separate from document zoom but shares key interpretation.
Fullscreen, link-copy/open and Neovim window commands are outside this decision.
Keyboard/factor acceptance is not full zoom/DPI click-coordinate or layout parity.
