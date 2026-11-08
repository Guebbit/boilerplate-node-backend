---
source: tests/cross-cutting/alert-rules-metrics.test.ts
sha256: e9ac7bd6470d51fae29f762b1f51c7a6a6ee9ca42def81f9a6da55ae3884694a
generated_at: 2026-11-08T09:22:42.390978+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/alert-rules-metrics.test.ts

## Purpose

Guards against a silent failure mode: an alert rule referencing a metric name that the code never registers. Such a rule evaluates to an empty vector, never fires, and produces no error. This test statically cross-checks every `*_total` counter used in the Prometheus alert-rules YAML against the metric names registered in `src/`, without booting any process.

## Key elements

- **`RuleFile`** (interface) — Typed shape of the parsed alert-rules YAML: `groups → rules → { alert, expr }`.
- **`sourceFiles(directory)`** — Recursively collects all `.ts` file paths under a directory; deliberately skips the `tests` subtree.
- **`rules`** — The parsed contents of `docker/observability/prometheus.alert-rules.yaml`.
- **`registered`** (Set) — All metric names matched by the regex `name:\s*'([a-z][a-z0-9_]*)'` across every source file under `src/`.
- **`readByRules`** — Flat list of `{ alert, metric }` pairs extracted from rule expressions via the `\b([a-z][a-z0-9_]*_total)\b` pattern.
- **Test: "read some counters at all…"** — Sanity guard ensuring the extraction logic actually found data (≥ 10 rule references, ≥ 30 registered names), preventing a vacuous pass.
- **Test: `%s reads %s, which the code registers`** — Parametrized (`it.each`); one assertion per `(alert, metric)` pair confirming the metric exists in the `registered` set.

## Relationships

- **`tests/support/paths.ts`** — Imports `REPO_ROOT`, which anchors all `readFileSync` / `readdirSync` calls to the repository root so the test works regardless of the current working directory.

## Notes

- Only `*_total` counters are validated. Metrics like `up`, `http_*`, and `nodejs_*` are intentionally excluded because they are emitted by Prometheus or `prom-client`'s built-in collectors, not by a `name:` literal in this repo.
- The test is purely text-based (YAML parse + regex on source); it never imports application code or starts a server.
- The `registered` regex requires the metric name to be wrapped in single quotes after `name:`, matching the convention used by the project's counter/gauge registration helpers.
- The `sourceFiles` helper skips the `tests/` directory so test-local fixtures don't inflate the registered set.
