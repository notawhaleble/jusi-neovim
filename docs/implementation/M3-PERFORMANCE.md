# M3 extraction performance evidence — 2026-10-11

Run the focused development benchmark after building:

```sh
PATH=/opt/homebrew/opt/node@24/bin:$PATH npm run build
PATH=/opt/homebrew/opt/node@24/bin:$PATH JUSI_TEST_EXTRACTION_ONLY=1 JUSI_TEST_PERF_LABEL=latest node scripts/run-smoke-electron.mjs
```

This reuses the disposable-profile Electron runner. It opens an isolated sandboxed
Chromium window, executes production extraction with test-only slice instrumentation,
and saves `.local/review/extraction-performance-<label>.json`. It does **not** measure
Neovim publication, either adapter's complete lifecycle, or the host renderer UI.
Default shared interaction/packaged fixtures supply integration coverage separately.

Machine: Apple M1, 16 GiB RAM, macOS arm64; Node 24.10.0; Electron 44.5.0,
Chromium 152.0.7977.130. One run per code/fixture revision, not repeated statistical
trials. Slice p95 describes slices within that run. Instrumentation has overhead.

| Input (200k UTF-16 units) | Baseline elapsed ms | Optimized elapsed ms | Optimized slice p95/max ms | Input p95/max ms |
| --- | ---: | ---: | ---: | ---: |
| Ordinary words | 1383.4 | 1397.6 | 8.0 / 8.1 | 6 / 7 |
| Single unwrapped node | 21.8 | 22.5 | 8.6 / 8.6 | no samples |
| Single wrapped word | 5852.6 | 1084.5 | 8.0 / 8.8 | 6 / 8 |

Baseline: `extraction-performance-baseline.json`; optimized:
`extraction-performance-verified.json`. The wrapped case retained exactly 200,000
units and 2,410 lines; approximately 5.4x faster in these runs. The normal-word case
removes trailing visual-line spaces as before (197,501 mirrored units / 2,500 lines).
The unwrapped case completed before the first 25 ms input probe; its zero guest timer
gap in this artifact means no timer samples, not zero latency. New reports explicitly
use null and sample counts for unsampled timers.

The benchmark sends real key events every 25 ms while extraction runs. Latency is
main-process send to guest keydown handling using millisecond wall timestamps; only
keys handled before extraction completion count. This is event-delivery latency,
not frame presentation or end-to-end host input latency. There were 54 word-case
samples and 42 wrapped-case samples. Input lives in an excluded form control.

Guest first-contentful-paint entries were 164 / 132 / 128 ms, respectively, on the
optimized run. Extraction starts after two animation frames, so these numbers do
not prove concurrent automatic rich-first-paint acceptance in the presentation host.
Guest timer gaps peaked at 39.9 ms; main-process gaps at 12.3 ms. Timers are proxies,
not a host-renderer stall measurement. The 8 ms target is not uniformly met and the
50 ms host UI gate remains open.

A mutation scheduled at 25 ms superseded the active build; rejection was observed
at 49.6 ms, no index map was published, and extraction of the replacement text
succeeded. Geometry assertions run after the measurement clocks stop. An earlier
instrumented run included geometry-check overhead in timer gaps (`perf-final.log`,
53.2 ms); it is superseded by the corrected measurement, not evidence of a runtime
stall fix. The input/source cancellation contract remains unchanged.

Implementation: recursively split wrapped ranges until each range occupies one
visual line, then copy its mappings together. This removes most per-character Range
queries without inventing geometry. Unwrapped mapping copies now check the yield
clock every 1,024 units. Unit coverage models 80-unit visual lines and requires exact
line lengths and fewer range queries; actual Chromium checks every wrapped mirror
line against its DOM range. Shared adapter geometry/cursor integration remains in
the existing desktop suites.

Next: measure end-to-end automatic text publication and host renderer responsiveness
through both adapters; instrument remaining normalization/tokenization phases before
further tuning; add repeated trials and representative Unicode/layout cases. Do not
close R2/M3 timing gates from this isolated benchmark.
