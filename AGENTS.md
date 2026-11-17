# Working agreement

Read `AGENT.md` for engineering invariants, then `docs/implementation/STATUS.md`
and `docs/implementation/requirements.json` before changing code.

This is a Neovim presentation host. Web browsing is one provider. Keep Neovim
state authoritative and use explicit window/grid identities. Providers are
trusted installed code; their documents and extraction results are untrusted.

## Session protocol

1. Inspect `git status --short` and preserve unrelated edits. Do not reset the tree.
2. Run `npm run harness` to see incomplete requirements and the next milestone.
3. Read the relevant ADR and acceptance cases in `docs/implementation/PLAN.md`.
4. Implement one coherent milestone, including its integration and error paths.
5. For implementation milestones, run `npm run check`. For guest, focus, text lifecycle, or permission changes,
   also run `npm run smoke:electron` on a desktop (Linux: `xvfb-run -a`). Apply
   the selective visual/manual review policy below; computer use is not required
   on every turn or every passing implementation milestone.
6. Update STATUS with exact checks, failures, known limits, and the next step.
   Update requirements evidence only after verification. Passing infrastructure
   checks does not mean browser safety parity or all requirements are complete.
7. Keep future work in implementation docs, current behavior in architecture
   docs, and durable decisions in `docs/decisions/`.

Do not silently enable shell expansion for provider commands, expose Neovim IPC
to documents, disable TLS verification, reuse Chrome's live profile directory,
or claim browser security equivalence without the release-gate evidence.

No publishing or remote repository creation is needed for local implementation.
Package directories must remain extractable into independent repositories.

## Testing and cost

The user stopped test delegation again on 2026-10-11. Run implementation,
verification, routine triage and final acceptance in the primary agent. Do not
spawn or resume sub-agents unless the user explicitly requests delegation again.
The superseded experiment is archived at
`docs/implementation/backups/AGENTS.luna-testing.2026-10-11.md.bak`.

Reduce verification orchestration as well as output: use one sequential command
batch that stops on failure, save logs to disk, and use appropriately long tool
waits (up to 60 seconds) instead of repeated short polls. Inspect the exact failing
assertion before diagnosing. Run a focused affected workflow after a fix; run the
required broader suites at the milestone boundary. If no focused harness exists,
record that limitation rather than copying the whole harness. Do not repeat passed
checks without a new change or unresolved concern. The selective CUA policy below
remains active.

On this machine, select Node 24 with
`PATH=/opt/homebrew/opt/node@24/bin:$PATH`.
Run checks sequentially and keep the code being verified unchanged until they
finish. Do not launch competing builds or desktop workflows. Save verbose logs to
`.local/review/` and inspect relevant excerpts first. Report commands, exit codes,
failures, artifact paths and checks not run concisely.

Diagnose unexpected failures before changing code or rerunning checks. Avoid blind
reruns; use a targeted rerun only for an identified cause or transient condition.

Use focused checks while implementing, then the required suite once at the coherent
milestone boundary. A new change, failure or unresolved concern may justify another
run. Package smoke is required when packaging, shipped runtime/resources, preload,
Electron security configuration or package-specific behavior changes; otherwise run
it at a browser integration/release checkpoint rather than every small slice.
Keep automated desktop verification for affected behavior; schedule manual review
using the policy below.
Do not copy and modify an entire manual smoke harness for routine verification;
prefer a reusable review mode and escalate missing harness support.

### Selective visual and computer-use review

Automated Electron assertions and scripted input are distinct from model-driven
computer use (CUA). Keep required automated checks. Do not routinely replay their
passing workflows through CUA.

- Default: no CUA for refactors or fixes whose behavior is covered by meaningful
  automated assertions. Record manual review deferred, not passed.
- Inspect an existing screenshot only when appearance/layout changed or a visual
  concern exists. Use the saved artifact without opening a live app when sufficient.
- Use targeted CUA immediately for a new user interaction not covered by automation,
  a visual/focus/input issue automated evidence cannot resolve, or a native/OS flow
  such as real IME, device permissions or system dialogs. A changed file or broad
  category such as "focus" alone is not a trigger.
- Accumulate covered UI changes in a short STATUS queue. Run one combined manual
  review after three completed UI-affecting milestones with deferred review, or at
  the next browser integration/release checkpoint, whichever comes first. Docs-only
  and non-UI milestones do not advance the counter. User-requested manual review
  also triggers it. Review both adapters only for affected shared workflows.
- Use a compact list of changed workflows and expected results. Reuse the
  existing review harness, batch deterministic interactions, prefer concise AX
  observations, and take screenshots only to answer a visual question. Avoid full
  tree dumps and repeated exploration after evidence is sufficient.
- Stop and report a concrete failure instead of repeatedly clicking or restarting.
  Do not repeat successful manual review without a new concern. Explicit release-gate
  manual requirements still apply; deferral cannot establish browser safety parity.

For instructions/documentation-only changes, use `npm run harness`, diff review and
`git diff --check`; do not run build, desktop or packaged suites unless the changed
content affects their execution. Record this scope accurately in the handoff.

## Project scope

Name shared behavior work by capability (browser interaction, text lifecycle,
mapping, focus conformance), not by popup presentation. Browser documents must use
the same behavior regardless of where they are displayed. Keep DOM/native transport
differences in adapters. Reserve popup/new-window work for opening policy, actual
Chromium child adoption, opener/exact Session preservation and parent/child lifetime.
For any proposed special case, state which platform or child-window constraint
requires it; otherwise factor it into the shared browser implementation. Shared
behavior acceptance must exercise both adapters, including missing action dispatch.

Non-browser provider implementations belong in their own repositories and separate
sessions. The existing Markdown test package is retained as API conformance evidence;
do not expand it here. Current implementation work focuses on host/core and browser
functionality. A jusi-neovim plugin-authoring skill is deferred until explicitly requested.
