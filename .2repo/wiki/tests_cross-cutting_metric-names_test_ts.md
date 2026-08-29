# tests/cross-cutting/metric-names.test.ts

## Purpose

Cross-cutting guard that catches metric-name drift — the failure mode where renaming a counter compiles, lints, and passes every unit test, yet silently breaks the overview endpoint, Prometheus dashboards, and alerts. It does this by reading `metrics.ts` files and the overview controller as **source text** (via `node:fs`), never importing them, so no database, no Mongoose, no domain boot is triggered.

## Key elements

- **`withoutComments(source)`** — strips block and line comments so a note between `new Counter({` and its `name:` field cannot hide a declaration from the regex sweep.
- **`metricFiles()`** — discovers every `src/modules/<name>/metrics.ts` by directory listing rather than a hardcoded list.
- **`declarations()`** — extracts `{ module, name, kind, help }` tuples via a single `matchAll` over `new (Counter|Gauge|Histogram|Summary)({…})` blocks, keeping the three facts attached to one metric.
- **`nameAssignments()`** — pulls every line matching `name:` (literal or not) to enforce the literal-only convention.
- **`namesReadByLiteral()`** — extracts the string arguments of `readCounter('…')` in the overview controller.
- **`describe('metric names')`** — seven cases:
  - *Canary*: at least 5 files, 12 declarations, 5 literal reads exist (prevents vacuous passes).
  - *Resolution*: every literal read by the overview endpoint is declared by some module.
  - *Literal-only*: no `name:` assignment is a variable or template string.
  - *Shared registry*: declaration count equals `registers: [metricsRegistry]` count per file.
  - *Naming*: names match Prometheus `snake_case` (`^[a-z][\da-z]*(?:_[\da-z]+)*$`).
  - *Counter suffix*: `Counter` kinds must end in `_total`.
  - *Help text*: every `help` string is ≥ 15 trimmed characters.

## Relationships

No dependency-graph neighbors are recorded. The file interacts with `src/modules/*/metrics.ts` and `src/modules/observability/controllers/get-observability-metrics-overview.ts` **only through `readFileSync`** — it never imports them. The design deliberately mirrors `outbox-names.test.ts` (referenced in the header comment) as a sibling pattern for "read source text, don't boot the module."

## Notes

- **No duplicate-name check.** `prom-client` itself throws on duplicate registration; asserting it here would test the library, not this repo.
- **Regex is the contract.** The `declarations()` regex expects `name` and `help` as single-quoted string literals in a specific order. A reformat that swaps field order or uses double quotes will silently drop a declaration from the sweep.
- **`withoutComments` handles block comments only via non-greedy `[\S\s]*?`** — a comment containing `*/` inside a string literal would be mis-stripped, though no known file triggers this.
- **The `_total` suffix rule applies to `Counter` only.** Gauges, Histograms, and Summaries are exempt; the test filters on `kind === 'Counter'`.
- **The canary test is load-bearing.** Without it, a rename of `metrics.ts` to `metrics.tsx` (or a move) would make every sweep iterate over an empty list and all assertions pass vacuously.
