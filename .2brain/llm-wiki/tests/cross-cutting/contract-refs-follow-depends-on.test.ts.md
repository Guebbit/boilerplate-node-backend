---
source: tests/cross-cutting/contract-refs-follow-depends-on.test.ts
sha256: a9276edd1ba8d88bfce499f3ed7ae554e37b3c8d9c967377853dac951b72a581
generated_at: 2026-10-15T12:36:58.065313+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-refs-follow-depends-on.test.ts

## Purpose

Guarantees that every cross-module `$ref` in a sibling's `openapi.yaml` is backed by an explicit `dependsOn` entry in the referring module's `module.yaml`. This prevents a "rm -rf deletes a module → dangling reference breaks the bundle" failure mode by making undeclared coupling a test failure instead of a deploy surprise.

## Key elements

- **`MODULES`** — absolute path to `src/modules`, resolved from the test file's directory.
- **`SIBLING_REF`** — global regex matching `$ref: '../<module>/openapi.yaml#'` (relative sibling refs only).
- **`CrossReference`** — interface `{ from: string; to: string }` representing one who-references-whom edge.
- **`withContract()`** — lists module directories that contain an `openapi.yaml` file.
- **`referencesOf(module)`** — extracts all sibling `$ref` targets from one module's contract, returning `CrossReference[]`.
- **`dependenciesOf(module)`** — parses `module.yaml` and returns its `dependsOn` array (or `[]`).
- **`describe('contract references and dependsOn')`** — two assertions:
  1. *Count guard*: the total number of cross-module refs is exactly 18 (with `orders` deployed) or 2 (without), so a broken sweep can't silently pass.
  2. *Declared-dependency check*: every `to` in a `CrossReference` must appear in `dependenciesOf(from)`.

## Relationships

- **`tests/support/paths.ts`** — provides `isDeployed(env)`, which the count-guard test calls to pick the expected reference total (18 vs 2) depending on whether the `orders` environment's modules are present.

## Notes

- The regex intentionally matches only *relative sibling* refs (`../<name>/openapi.yaml#`). Absolute refs, non-OpenAPI targets, and bundler-injected sections (built from `x-personal-data`) are out of scope by design — the doc comment explains that those sections travel with their module and can't dangle.
- The count test asserts an **exact** number, not `>= 1`, so a regression that causes `withContract()` or `referencesOf` to silently return nothing will fail rather than pass vacuously.
- `referencesOf` filters out self-references (`to !== module`), so a module that `$ref`s its own spec is not counted.
