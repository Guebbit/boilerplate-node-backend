---
source: tests/cross-cutting/contract-refs-follow-depends-on.test.ts
sha256: 4b6a14b88da92044d5cd31c183c7a3f918cb80244f7178fb1877fad133b18bd3
generated_at: 2026-10-29T06:44:38.043556+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-refs-follow-depends-on.test.ts

## Purpose

Guarantees that every cross-module `$ref` in an `openapi.yaml` contract points only to a sibling that is explicitly declared in the referencing module's `module.yaml` `dependsOn`. This keeps the dependency map truthful so that deleting a module folder never leaves a dangling reference in a still-present contract.

## Key elements

- **`SIBLING_REF`** — Regex matching `$ref: '../<module>/openapi.yaml#…'` patterns inside contract files.
- **`CrossReference`** — `{ from, to }` pair describing one cross-module reference.
- **`withContract()`** — Returns the names of module directories under `MODULES_ROOT` that contain an `openapi.yaml`.
- **`referencesOf(module)`** — Extracts all sibling references from a single module's contract (excludes self-references).
- **`dependenciesOf(module)`** — Parses `module.yaml` and returns the `dependsOn` array (empty if absent).
- **`describe('contract references and dependsOn')`** — Two specs: (1) the collected reference list has the exact expected count (2 for undeployed, 14 when `orders` is deployed), and (2) every `from → to` pair appears in the source module's `dependsOn`.

## Relationships

- **`tests/support/paths.ts`** — Supplies `MODULES_ROOT` (the root directory of module folders) and `isDeployed(module)` (used to make the expected reference count environment-aware).

## Notes

- The count assertion is deliberately **exact**, not "at least N", so a broken regex or a missing `MODULES_ROOT` cannot silently pass with zero matches.
- Only *authored* `$ref`s are checked. Sections the bundler injects from `x-personal-data` are excluded by design: they are added/removed together with the module, so they never dangle.
- The regex anchors on the literal `openapi.yaml` filename; a sibling contract stored under a different name would not be caught.
