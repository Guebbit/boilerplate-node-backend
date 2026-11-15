---
source: src/modules/example/tests/unit/manifest.test.ts
sha256: d1a73269808b5d56adf9a7343acb7b04202e3469133c2ad0951c557ee8a28d31
generated_at: 2026-11-14T20:02:12.612871+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/unit/manifest.test.ts

## Purpose

Unit test that pins the public contract of the `example` module: the shape of its webhook projection, which fields are translatable, the registered image target key, the personal-data export/erasure pair, and the rate-limit budget it ships. It exists so that other modules (`account`, `users`) can rely on this surface without importing the module directly, and so regressions in the manifest are caught immediately.

## Key elements

- **`describe('the example manifest')`** – Six assertions covering:
  - Module is named `example` and mounted at `/examples`.
  - The public-event projection for `EXAMPLE_PUBLISHED` carries only `exampleId` and `title`, stripping `userId`.
  - `translatables.example.fieldRules.shape` exposes only `title`; collection is `examples`.
  - `imageTargets` is keyed by `['examples']` (the key the digest job uses).
  - `personalData` array contains a section named `examples` with a function-typed `erase`.
  - `module.rateLimits` is referentially identical to `exampleRateLimits`.
- **`describe('the creation budget')`** – Validates the first budget in `exampleRateLimits`: environment variable `NODE_EXAMPLE_RATE_LIMIT_MAX`, keyed by the authenticated account, `skipSuccessfulRequests` asserted via `toBeUndefined()`, and `audited` set to `true`.

## Relationships

- **`src/modules/example/module.ts`** – The default export under test; every assertion in the first `describe` block reads a property off this module instance.
- **`src/modules/example/events.ts`** – Supplies `EXAMPLE_PUBLISHED`, the event key used to index the public-event map.
- **`src/modules/example/rate-limits.ts`** – Supplies `exampleRateLimits`, used both for the reference-identity check and for the per-budget field assertions in the second `describe` block.
- **`tests/support/stub.ts`** – Provides `asStub<never>(…)` to construct a minimal, type-erased input object for the projection call without importing a full entity type.

## Notes

- The test file name says *manifest*, but the second `describe` block actually asserts on `rate-limits.ts` internals. Keep budget-shape assertions here only while the budget is part of the public contract; if it moves to an internal detail, migrate them to a dedicated rate-limits test.
- `asStub<never>` is a deliberate escape hatch: the projection function's parameter type is not imported, so the test avoids a circular type dependency.
- The `userId`-stripping assertion is the most behavior-sensitive line; if the public event schema gains a new field, this test will fail and force a conscious decision about whether that field is subscriber-visible.
