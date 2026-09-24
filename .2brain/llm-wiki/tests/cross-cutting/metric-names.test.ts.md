---
source: tests/cross-cutting/metric-names.test.ts
sha256: 89935b5900a8fe03112c46b9b7f5a021a943a826daba3fa12296f35905210cd7
generated_at: 2026-09-23T19:56:53.227451+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/metric-names.test.ts

## Purpose

Cross-cutting test that validates Prometheus metric names by reading the **source text** of every `metrics.ts` file and the overview controller, rather than importing them (which would boot Mongoose). It exists because a renamed counter compiles, lints, and passes unit tests silently — the only failure is a dashboard line going flat weeks later.

## Key elements

- **`metricFiles()`** — discovers every `src/modules/<name>/metrics.ts` plus `src/infrastructure/persistence/metrics.ts` (infrastructure-owned counters like `db_queries_total` that no single domain module claims).
- **`declarations()`** — extracts `{module, name, kind, help}` tuples via a single regex match on `new <Kind>({ name: '…', help: '…' })`, keeping the three fields attached so they can't be cross-paired.
- **`nameAssignments()`** — collects every `name:` line (literal or computed) for the "must be a literal" guard.
- **`namesReadByLiteral()`** — extracts the string literals passed to `readCounter('…')` in the overview controller.
- **`withoutComments()`** — strips block and line comments before scanning, so a comment between `new Counter({` and its `name:` doesn't hide a declaration.
- **Test cases** (all in `describe('metric names')`):
    - Canary: file/declaration/literal counts are non-trivial.
    - Every name read by the overview controller resolves to a declared metric.
    - Every `name:` assignment is a single-quoted string literal.
    - Declaration count equals `registers: [metricsRegistry]` count per file.
    - Names are valid Prometheus snake_case.
    - `Counter` metrics end in `_total`.
    - `help` text is at least 15 characters.

## Relationships

No graph neighbors are listed. The test is intentionally **decoupled** from the modules it inspects: it reads raw source files via `node:fs` and never imports them, so no runtime dependency edges exist.

## Notes

- **Source-text reading is only sound while two invariants hold**: every name is a literal, and every declaration registers on the shared registry. The test enforces both, but they are load-bearing assumptions — a future refactor that computes a name or registers on a private registry would silently break the scan.
- **Not asserted**: uniqueness of names. `prom-client` throws on duplicate registration, so a collision cannot reach a running process; the test explicitly declines to duplicate that guarantee.
- The `account/metrics.ts` module contains a comment line that sits exactly where the regex expects the first field; `withoutComments()` exists specifically to prevent that from masking a declaration.
- Infrastructure metrics (`db_queries_total`, `db_errors_total`) are counted toward by every repository, so they live in a single shared file rather than in a domain module — the test hardcodes that path in `INFRASTRUCTURE_METRIC_FILES`.
