---
source: tests/cross-cutting/alert-rules-metrics.test.ts
sha256: 73c41d493f097fe1e40ad73f946bad7e1102863f493e70b4c400d5d6c8a0af6e
generated_at: 2026-10-15T12:34:40.235752+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/alert-rules-metrics.test.ts

## Purpose

Prevents silent alert failures caused by metric name drift. It statically verifies that every `*_total` counter referenced in `prometheus.alert-rules.yaml` has a matching `name: '<metric>'` registration somewhere under `src/`, catching the "empty vector → alert never fires" case that Prometheus cannot itself distinguish from a healthy zero.

## Key elements

- **`sourceFiles(directory)`** — Recursively collects all `.ts` files under a directory, skipping the `tests/` subtree.
- **`registered`** (Set of strings) — Every metric name extracted via the regex `name:\s*'([a-z][a-z0-9_]*)'` across all `src/` files.
- **`readByRules`** (array of `{ alert, metric }`) — Every `*_total` counter name found in alert `expr` fields, paired with the alert that reads it.
- **`describe('alert rules and the metrics behind them')`** — Two test blocks:
  - A sanity guard asserting the extracted lists are non-trivially sized (>10 rule-metric pairs, >30 registered names) so a broken regex doesn't silently pass.
  - An `it.each` case that asserts each extracted metric is present in `registered`.

## Relationships

- **tests/unit/scripts/docs/module-catalogue.test.ts** — Sibling cross-cutting test in the same validation pattern: both parse repository files as text to check structural consistency without booting the application. No runtime import between them; the link is the shared "read-the-repo-as-text" testing idiom under `tests/`.

## Notes

- Only `*_total` counters are checked. Metrics like `up`, `http_*`, and `nodejs_*` are deliberately excluded because they come from Prometheus' own collectors or `prom-client` built-ins, not from a `name:` literal in this repo.
- The test reads files as raw text and uses regex extraction — no TypeScript compilation, no module loading, no process is spawned. This keeps it fast and independent of the application's runtime environment.
- The YAML rule file lives at `docker/observability/prometheus.alert-rules.yaml` (resolved relative to the repo root, two levels up from `tests/cross-cutting/`).
- The `it.each` generates one test per (alert, metric) pair, so a failing metric name surfaces as an individually named failure rather than a single aggregate assertion.
