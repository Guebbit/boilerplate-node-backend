---
source: tests/cross-cutting/side-effects-have-one-layer.test.ts
sha256: b67c5f4ad800722def4f2dbcfccda03fd461af02b8074f63126b8514521e6e3f
generated_at: 2026-10-15T12:41:09.383802+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/side-effects-have-one-layer.test.ts

## Purpose

Enforces a cross-cutting architectural invariant: four side-effect functions (`enqueueEmail`, `recordAudit`, `emitAnalyticsEvent`, `emitDomainEvent`) must be called from exactly one layer (`service`) across all modules. It exists because this is a *set-level* constraint—no per-file lint rule can see that fourteen call sites collectively violate a layering intent—so it is expressed as a test that scans the whole tree.

## Key elements

- **`EXPECTED_LAYER`** — Readonly map from side-effect marker to the single layer that owns it. All four entries are `'service'`.
- **`ALLOWED_ELSEWHERE`** — Readonly map of named exceptions, keyed `"<marker> @ <module>/<path>"`, each value being the one-sentence justification that earns the departure.
- **`moduleFiles()`** — Recursively walks `MODULES_ROOT`, returning every `.ts` file while skipping `tests/` subdirectories.
- **`layerOf(file)`** — Classifies a file into `controller | service | repository | model | routes | domain | other` from its path segment relative to the module root. `services/` directory and bare `service.ts` map to the same layer.
- **`callSites()`** — Reads every module file as text, strips comments, then regex-matches each marker in `EXPECTED_LAYER` (word-boundary anchored, `marker(`). Returns a `Map<string, { file, layer }[]>`.
- **`label(file)`** — Produces the `<module>/<path>` string used in failure messages and allowlist keys.
- **Test suite (4 cases)**:
  - *Canary* — asserts the sweep actually finds call sites (prevents a silent no-op if the regex stops matching).
  - *Layer enforcement* — collects all call sites whose layer differs from `EXPECTED_LAYER` and are not in `ALLOWED_ELSEWHERE`; asserts the list is empty.
  - *Stale exceptions* — asserts no key in `ALLOWED_ELSEWHERE` points to a file that no longer calls that marker.
  - *Valid layer names* — guards `EXPECTED_LAYER` values against typos outside the `Layer` union.

## Relationships

- **`tests/support/paths.ts`** — provides `MODULES_ROOT` (the directory tree the test scans) and `isDeployed('orders')` (used in the canary to conditionally require `emitDomainEvent` call sites only when the `orders` module is present).

## Notes

- Matching is plain-text regex, not AST: it looks for `marker(` with a word-boundary lookbehind after stripping `/* */` and `//` comments. This means a call hidden behind a template literal or dynamic invocation would be missed—intentional simplicity over completeness.
- `ALLOWED_ELSEWHERE` keys are scoped to both marker *and* file, so an exception for `recordAudit` in a given file does not implicitly permit `enqueueEmail` in the same file.
- The canary for `emitDomainEvent` is conditional on `isDeployed('orders')` because only shop modules publish domain events; the other three markers are unconditional.
- The test lives under `cross-cutting/` (not `unit/` or `integration/`) because it asserts a property of the *set* of files rather than the behavior of a single module.
