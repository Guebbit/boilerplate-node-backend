---
source: tests/cross-cutting/metric-names.test.ts
sha256: 03c9811eca3692e73095d830e9b672b6b5c2eec83ccde301d6fc889a18c6bc95
generated_at: 2026-09-27T15:50:48.379107+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/metric-names.test.ts

## Purpose

Cross-cutting test that validates metric-name consistency across the codebase by parsing source text with regex rather than importing modules. It ensures every name the overview controller reads by string is actually declared, that all declarations follow Prometheus naming conventions, and that the source-text reading approach remains sound (all names are literals, all metrics registered on the shared registry). It exists because a renamed counter compiles cleanly, passes all unit tests, and silently breaks dashboards—no type system or runtime check catches it.

## Key elements

- **`withoutComments`** — strips block and line comments before regex matching; prevents a comment between `new Counter({` and `name:` from hiding a declaration.
- **`metricFiles()`** — discovers all `src/modules/*/metrics.ts` via `readdirSync`/`existsSync`, plus a hard-coded infrastructure metrics file. Returns `{ module, file }` pairs.
- **`declarations()`** — extracts every `new (Counter|Gauge|Histogram|Summary)({ name, help })` block as a single match so kind/name/help stay attached.
- **`nameAssignments()`** — lists every `name:` line (literal or not) across all metric files, used by the "must be a literal" assertion.
- **`namesReadByLiteral()`** — extracts the seven strings passed to `readCounter('…')` in the overview controller.
- **`describe('metric names')`** — seven assertions: canary (non-empty sweeps), name resolution, literal-only names, shared-registry registration, snake_case shape, `_total` suffix on counters, and minimum help-text length (≥ 15 chars).

## Relationships

- **`tests/support/paths.ts`** — imports `MODULES_ROOT` to locate the module directories and the overview controller file. No other coupling; the test is otherwise self-contained and reads files directly from disk.

## Notes

- Deliberately reads **source text**, not runtime exports, so it never boots Mongoose or triggers side-effects of importing a module's `metrics.ts`.
- Infrastructure metrics (`db_queries_total`, `db_errors_total`) live outside `src/modules/` and are included via a hard-coded path; they are infrastructure-owned, not domain-owned.
- Duplicate-name detection is intentionally **absent**: `prom-client` throws at registration time on a collision, so a test assertion would restate a library guarantee.
- The first test ("finds the metrics…") is a canary: without it, a renamed file or changed call shape would make every subsequent assertion sweep over an empty list and pass vacuously.
- `account/metrics.ts` contains a comment line between `new Counter({` and its `name:` field; the `withoutComments` step exists specifically because of that file.
