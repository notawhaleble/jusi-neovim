# Agent Notes

## Engineering Bar

Preserve the architecture before optimizing for speed. Prefer solutions that
make ownership, data flow, and boundaries clearer. Avoid patches that only make
the current symptom disappear while leaving the model less truthful.

When a clean solution is available, take it. When the clean solution is too
large for the current step, make the smallest change that still moves the code
toward the intended architecture.

## Pause Before Shortcuts

Before implementing a workaround, ask whether it violates one of the core
architecture decisions:

- Neovim owns editor state.
- The bridge resolves Neovim state into explicit app state.
- The renderer consumes resolved state; it does not invent ownership.
- Web content is a composed surface, not an uncontrolled overlay.
- Mirror text is part of the web-buffer contract, not a loose approximation.

If a shortcut would weaken those rules, warn the user and pause before
implementing it. Explain:

- what the shortcut would do
- why it is not clean
- what risk it creates
- what the cleaner alternative would require

Only proceed with the shortcut after the user accepts the tradeoff.

## Implementation Rules

- Use explicit state over inference.
- Prefer typed contracts between bridge, core state, renderer, and runtime.
- Keep Neovim-derived state authoritative when composing editor UI.
- If state cannot be resolved confidently, show less rather than guessed
  content.
- Keep debug and diagnostic UI behind intentional switches once the behavior it
  diagnoses is stable.
- Keep roadmap/planning notes out of architecture docs.

## Checks

After changes that touch layout, grid ownership, tab switching, input routing,
or web surface placement, run:

```sh
npm run build
npm run smoke:live
```

Also manually exercise affected editor workflows when the change is visual or
interactive.

