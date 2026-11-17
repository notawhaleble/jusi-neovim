# ADR 0020: Bound native popup mode routing

Status: accepted for the experimental native popup path.

Retained native children register with the shared Lua presentation lifecycle without
calling a provider or replaying their URL. NativeChildOwner dispatches mode requests
with host epoch, reservation sequence/token, buffer and incarnation. Lua checks the
live buffer and original float, rejects hidden tabs and replacement incarnations,
and selects that exact window before applying the shared mode state.

Native focus reports rich mode for its bound child. Ctrl-backslash then Ctrl-N within
1.2 seconds returns focus to the shell after the validated text-mode transition.
The existing Neovim `i` mapping routes back to the matching visible native child.
Ctrl-Q closes the actual child; its owner removes the float. Input sequences and
mode requests invalidate obsolete focus completions. See ADR 0021 for focus
preservation across temporary hiding. Modifier-only events preserve the chord;
composition events are not intercepted. This does not constitute IME acceptance.

The rich document remains visible in editor mode. No popup extraction or cursor
projection is implemented yet; editor focus is a prerequisite for optional text,
not evidence that text navigation works. Default auxiliary popup routing is unchanged.
