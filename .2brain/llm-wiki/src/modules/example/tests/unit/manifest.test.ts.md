---
source: src/modules/example/tests/unit/manifest.test.ts
sha256: e612b8bc8e227f22b09e741ed21766adae3d97586963c5e5d1d6acffc6467336
generated_at: 2026-10-15T10:31:19.365111+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/unit/manifest.test.ts

## Purpose

Verifies the public-facing contract of the `example` module manifest: what event subscribers see, which fields are translatable, how image targets and personal-data handlers are registered, and how the rate-limit budget is shaped. It exists to catch accidental changes to the module's outward projection without requiring an integration environment.

## Key elements

- **`describe('the example manifest')`** — Asserts:
  - `module.name` is `'example'` and `module.basePath` is `'/examples'`.
  - The `EXAMPLE_PUBLISHED` public-event projection strips `userId`, keeping only `exampleId` and `title`.
  - `translatables.example` exposes exactly `['title']` under collection `'examples'`.
  - `imageTargets` is keyed solely by `'examples'`.
  - `personalData` is an array whose first entry has `section: 'examples'` and a callable `erase`.
  - `module.rateLimits` is the same reference as `exampleRateLimits`.
- **`describe('the creation budget')`** — Inspects the first entry of `exampleRateLimits` and asserts its `environmentVariable`, `keyedBy`, that `skipSuccessfulRequests` is `undefined`, and that `audited` is `true`.

## Relationships

- **`src/modules/example/module.ts`** — The object under test. Every assertion reads a property off the default export (`name`, `basePath`, `publicEvents`, `translatables`, `imageTargets`, `personalData`, `rateLimits`).
- **`src/modules/example/events.ts`** — Supplies the `EXAMPLE_PUBLISHED` constant used as the key into `module.publicEvents` and as the `eventType` string in the expected projection.
- **`src/modules/example/rate-limits.ts`** — Supplies `exampleRateLimits`; the test both asserts it is the same reference held on the manifest and inspects its first budget entry's configuration.

## Notes

- `toPublicEvent` is called with an `as never` cast; the actual input shape is `{ exampleId, userId, title }`, but the signature is intentionally untyped in the test to focus on output.
- The rate-limit assertion that `skipSuccessfulRequests` is `undefined` (rather than `false`) is deliberate: it means *every* request consumes budget, not just failed ones.
- The `personalData` check destructures the array index `[0]` and asserts `typeof erase === 'function'` — it does not invoke the handler.
