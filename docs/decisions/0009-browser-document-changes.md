# ADR 0009: Browser DOM change detection without guest IPC

Status: implemented; filtering and batching amended by ADR 0030. The paragraphs
below record the original observer policy; current behavior is specified there.

Only automatic DOM-backed text views install a MutationObserver. Worker-backed
providers own their source lifecycle; text-off installs no observer. Document text,
child replacement and layout-relevant attributes increment a document-local counter.
Resize, resource load and font loading also mark geometry stale. Host-owned overlay,
mode-frame and pointer-style changes are filtered to avoid self-triggered rebuilds.

A mutation clears the guest's old index map and overlay and supersedes its extraction
job. Extraction checks this job identity after cooperative yields and before returning.
The web surface polls only the counter, one request at a time, roughly every 300 ms.
It validates the result and rejects operations spanning a detected DOM generation.
No preload, guest-to-host command bridge or document-controlled IPC is introduced.

On change, the shell cancels the text job, clears projection signatures, and requests
main-authorized document invalidation using the explicit guest/session/buffer IDs.
Main rejects mismatched, disabled and worker sessions, then advances the existing
revision queue. Old tickets cannot publish after this point. The existing 250 ms
refresh debounce rebuilds and publishes through the usual revision-checked path.

Observer notification precedes host polling; this is bounded-rate eventual refresh,
not a transaction spanning DOM, main and Neovim. Busy/background pages can delay
polls and extraction. Rapid changes coalesce; continuously changing content may
remain pending or fail/retry until stable. Parking retains monitoring. Navigation,
crash, policy changes and disposal use watcher epochs to prevent obsolete polling
callbacks from restarting another document's timer.

Form controls and editable content are excluded from mirrored text. This does not
remove arbitrary secrets rendered as ordinary page text. Counter/mirror data remain
untrusted. Shadow roots, subframe text, CSSOM-only edits and CSS animations are not
fully covered. Large-page timing and polling overhead still need measurement.
