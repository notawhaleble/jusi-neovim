# Automatic text timing — A1, 2026-10-12

The default production DOM adapter now has a focused measurement fixture:

```sh
PATH=/opt/homebrew/opt/node@24/bin:$PATH npm run build
PATH=/opt/homebrew/opt/node@24/bin:$PATH JUSI_TEST_ALPHA_TIMING=1 node scripts/run-smoke-electron.mjs
```

Use `JUSI_TEST_ALPHA_CASE=words|wrapped|unicode|mutation|navigation` for focused
triage. Results go to `.local/review/alpha-timing-all.json` or the selected case's
filename. The existing runner creates/disposes a test profile. This mode has a
120-second suite deadline (135-second parent cleanup watchdog); ordinary smoke
retains its prior deadlines. It does not extend document extraction deadlines.
The timing mode is development-only; packaged smoke still covers both adapters'
shared behavior separately. No new document-accessible API is introduced.

## What is measured

A real JusiWebBuffer loads loopback fixtures with automatic text enabled. The
fixture starts timing immediately before navigation, observes existing shell state
notifications for the expected document marker, and independently checks the marker in committed
Neovim text. The state observation is an upper bound on publication time, including
bridge delivery/batching. Published-mirror content equality checks ignore whitespace transformed by
visual-line extraction but preserve all non-whitespace UTF-16 units.

Guest first-contentful-paint is relative to the same navigation start. It measures
guest content paint, not proof of physical display/compositor presentation. Real
keyboard events are sent to a form field every 25 ms; timestamps measure main send
to guest keydown handling, counting only events before publication. Setup/focus time
before the first probe is outside input latency samples. The fixture checks retained
input and that rich paint precedes publication in the nine normal trials.

A PerformanceObserver in the actual host renderer records long tasks, supported
explicitly by the Chromium runtime. A 10 ms timer also records renderer scheduling
gaps; a separate main-process timer is reported independently. Long tasks and timer
gaps are evidence about these trials, not comprehensive OS/GPU/compositor latency.
The observer is drained before reporting. No guest timer is used as host evidence.

Three trials each: approximately 200k units of words, one wrapped word, and mixed
Latin/emoji/combining/CJK/Hebrew text. Two additional cases replace content and
navigate while status is building. Superseded markers must never publish, and the
replacement must appear in Neovim. Production revision/cancellation paths do the
work; the fixture does not run a substitute extractor or write the mirror itself.

## Finding and change

Initial words/wrapped trials passed. The Unicode build reached the production
10-second timeout. A focused isolated extraction took 11.064 seconds; sampled
phase activity attributed nearly all elapsed work to geometry. Its input remained
responsive, so raising a deadline would not address the cost.

The shared extractor now groups tokens within a text node, recursively splits
multi-line ranges, and reuses same-line geometry while keeping existing handling
of whitespace, tabs and explicit newlines. Groups spanning more than 1,024
normalized units split before a Range query to bound geometry result size. A single
long token still uses the existing wrapped-word splitting path. No transport-specific
extraction or guessed geometry was added. Modeled visual-line/content tests and the
normal shared adapter interaction suites cover regressions.

Initial grouped Unicode trials published in 8.99–9.17 seconds. Bounding grouped
queries reduced subsequent trials to about 8.6–8.7 seconds. It did not remove the
approximately 0.85-second Unicode rich-paint delay. Ordinary words improved from
about 1.36–1.71 seconds before grouping to about 0.75–0.78 seconds in the first
complete grouped run. These are fixture-specific observations on Apple M1 / 16 GiB,
macOS arm64, Node 24.10.0, Electron 44.5.0 / Chromium 152.0.7977.130; see the final
artifact for exact trial values. This is a bounded three-trial check, not a benchmark
claim across arbitrary sites or machines.

## Acceptance boundary

A1 remains partial: final trial results and verification are in STATUS. The default
path now has real automatic-publication and host-renderer measurement, including
cancellation/content checks. Unicode completion has little margin below the document
deadline, and its first paint remains slow. The 8 ms extraction-slice target has not
been re-established by this fixture: it intentionally does not instrument production
slice execution. Native-adapter end-to-end timing remains wider-plan work while the
alpha uses the default adapter. Linux, real IME, OS/compositor latency and browser
security parity are not established.

Further optimization is deferred by user direction on 2026-10-12. Continue A2's
combined everyday workflow and the remaining local-alpha gates. Retain Unicode
layout/first-paint and slice-budget assessment as later work; A1 stays partial.
