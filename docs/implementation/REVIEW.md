# Review of the starting implementation

Reviewed 2026-09-30. This distinguishes observed code from desired behavior.
The pre-existing `.html`/`.htm` raw-serving edit in `src/electron/main.ts` is preserved.

| Severity | Finding | Consequence | Treatment in this change |
| --- | --- | --- | --- |
| Critical | `jusi-directory` registered in every session; arbitrary absolute `path` accepted | Remote content shares a privileged local-file protocol; this is not a regular browser boundary | Restrict protocol to isolated local sessions and canonical opened roots; block local network requests; integration checks |
| High | No explicit request/check permission handlers | Browser permission behavior is not under user control | Default deny; main-frame HTTPS camera/microphone prompts with session grants; other devices remain a release gate |
| High | IPC command/mirror handlers do not authenticate the sender frame | Privileged Neovim command boundary lacks defense in depth | Authenticate shell WebContents and main frame |
| High | Guest preferences and navigation are not constrained in main | Renderer-created webviews can choose unsafe parameters; scheme transitions lack policy | Force sandbox/isolation/security, strip preload, deny nested guests/popups and forbidden navigation |
| High | Electron 38 dependency with no browser update/release policy | New application checks cannot compensate for obsolete Chromium | Explicit release blocker; engine update and packaged regression matrix are the next milestone |
| Medium | `persist:jusi-buffer-N` is both identity and profile | Login sharing depends on unstable buffer numbers | Named `persist:jusi-web-PROFILE`, isolated ephemeral local sessions |
| Medium | Text extraction is unconditional and monolithic, hashes only text | Loading/interaction can stall; equal text can retain obsolete geometry | Optional policy, yielding build, visible shell status, superseded-job rejection, mapping refresh |
| Medium | Buffer closure parks guests indefinitely | Resources, documents and credentials can outlive their buffers | Full buffer inventory drives disposal; hidden-tab sessions still park |
| Medium | Web is hard-coded throughout the bridge and renderer | New providers require editing host code | Lua provider registration and separately packaged web adapter; internal wire naming retained temporarily |
| Medium | Layout controller guesses grid ownership from geometry despite documented invariant | Same-sized splits/floats can attach the wrong surface | Resolve only explicit IDs; unresolved surfaces remain hidden |
| Medium | Existing live smoke prints observations without assertions | Regressions can produce green runs | Add asserted provider and Electron integration harnesses; strengthen live smoke |

The shell still contains a large DOM extractor/projector and built-in local
Markdown preview. This change does not describe that preview as a complete
Markdown plugin, or the webview backend as a general native-view backend.

## Security interpretation

Electron provides Chromium primitives, not a finished browser product. Its
[security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
requires application-level controls and maintenance. Electron's
[web embedding guidance](https://www.electronjs.org/docs/latest/tutorial/web-embeds)
also calls for careful backend selection. The inference for this product is
that requirement R5 needs an independently reviewed threat model, maintained
engine, adversarial tests and a release/update process, not just a preference
change. See the browser ADR and acceptance gates.
