# ADR 0028: Explicit browser text extraction limits

Status: accepted.

Both browser adapters use the shared extractor and controller. Extraction that
exceeds a budget returns only a bounded limit marker, never a partial mirror or
index map. The controller converts that untrusted marker into a host-owned
TextLayerLimitError; the generation-aware text job reports `limited`. The trusted
shell displays “Text limit reached · retry”. Ordinary failures remain `error`.
No document-provided error message is rendered. Retry and mutation recovery use
the existing revision/publication lifecycle; rich presentation remains available.

Budgets are 200,000 emitted UTF-16 units (including spaces later trimmed), 200,000
lines, 400,000 mapping entries, 100,000 visited text nodes including excluded nodes,
and 1,000,000 inspected source UTF-16 units across eligible nodes. These are work
bounds, not a promise to extract every document whose final normalized text fits.
Exactly reaching a budget succeeds if no further budgeted work is needed. There
is no truncated-text navigation contract; exhausted work does not publish.

Normalization checks the cooperative clock every 1,024 source units. Wrapped-word
geometry recursively splits ranges across visual lines and checks the clock at each
subrange. Multi-token ranges also split at visual lines and before querying spans
longer than 1,024 normalized units; whitespace/newline semantics remain unchanged.
Same-line mapping copies check every 1,024 units, in addition to existing
node/token yield points.
Checks use the existing 8 ms target and reject superseded jobs after yielding.
This bounds work between opportunities to yield, not the duration of a Chromium
layout call. Text transformation, tokenization, DOM traversal
and browser layout still need measured performance acceptance. Host deadlines do
not terminate guest CPU work. No 8 ms p95 or 50 ms stall guarantee is established.
