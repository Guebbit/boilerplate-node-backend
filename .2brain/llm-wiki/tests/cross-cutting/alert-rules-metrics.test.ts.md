---
source: tests/cross-cutting/alert-rules-metrics.test.ts
sha256: e9ac7bd6470d51fae29f762b1f51c7a6a6ee9ca42def81f9a6da55ae3884694a
generated_at: 2026-10-29T06:42:18.655629+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/alert-rules-metrics.test.ts

## Purpose

Guards against a silent failure mode: an alert rule that references a misspelled or renamed metric, which Prometheus would evaluate as an empty vector and simply never fire. The test cross-references every `*_total` counter read by alert-rule expressions against the `name:` literals actually registered in `src/`, catching typos before they go unnoticed.

## Key elements

- **`RuleFile`** — TypeScript interface describing the shape of the Prometheus alert-rules YAML (groups → rules with `alert` and `expr`).
- **`sourceFiles(directory)`** — Recursively walks a directory collecting all `.ts` file paths. Skips the `tests/` subtree entirely.
- **`registered`** — A `Set<string>` of every metric name found via the regex `name:\s*'([a-z][a-z0-9_]*)'` across all source files under `src/`.
- **`readByRules`** — Flat array of `{ alert, metric }` pairs extracted from each rule expression using the pattern `\b([a-z][a-z0-9_]*_total)\b`.
- **`describe` block** — Two test cases:
  - A sanity assertion that both lists are non-trivially populated (guards against the test accidentally scanning nothing).
  - A `it.each` parameterized assertion that every rule-read counter exists in `registered`.

## Relationships

- **`tests/support/paths.ts`** — Imports `REPO_ROOT`, which anchors all file-system paths (the alert-rules YAML under `docker/observability/` and the source scan under `src/`).

## Notes

- Only `*_total` counters are checked. Metrics like `up`, `http_*`, `nodejs_*` are intentionally excluded because they come from Prometheus itself or prom-client's built-in collectors, not from a `name:` literal in this repo.
- The test is purely static analysis on text — no process is booted, no server started. It reads the YAML and source files as raw strings.
- `sourceFiles` deliberately returns `[]` when it encounters a `tests/` directory, so metric registrations in test fixtures are not mistaken for real registrations.
- The sanity-check test (`toBeGreaterThan(10)` / `toBeGreaterThan(30)`) exists to fail loudly if a refactoring or path change causes the regex scans to match nothing, preventing a false-green.
