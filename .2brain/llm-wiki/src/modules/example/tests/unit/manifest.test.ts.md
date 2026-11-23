---
source: src/modules/example/tests/unit/manifest.test.ts
source_sha256: d1a73269808b5d56adf9a7343acb7b04202e3469133c2ad0951c557ee8a28d31
context_sha256: faf36fa7cf8709cbdf4e029d51509a3a51b34b0b76d085ab58e760ee67264714
generated_at: 2026-11-22T05:15:15.221196+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/tests/unit/manifest.test.ts

## Purpose
Unit tests for the `example` module's manifest (the default export of `module.ts`). They check what the manifest exposes to the rest of the application: its name and mount path, the public webhook projection, translatable fields, image targets, personal-data declarations, and rate-limit budgets.

## Key elements
- **`describe('the example manifest')`** — asserts on the manifest object:
  - `name` is `'example'` and `mounts` has a single `basePath` of `/examples`.
  - `publicEvents[EXAMPLE_PUBLISHED].toPublicEvent(...)` returns `{ eventType: 'example.published', data: { exampleId, title } }`. The owner's `userId` is deliberately left out.
  - `translatables.example.fieldRules.shape` has only the key `title`, and `translatables.example.collection` is `'examples'`.
  - `imageTargets` has only the key `examples`.
  - `personalData[0]` has `section: 'examples'` and an `erase` function (both an export and an erasure are declared).
  - `module.rateLimits` is the same reference as `exampleRateLimits`.
- **`describe('the creation budget')`** — checks the first entry of `exampleRateLimits`:
  - `environmentVariable` is `NODE_EXAMPLE_RATE_LIMIT_MAX`.
  - `keyedBy` is `'the authenticated account'`.
  - `skipSuccessfulRequests` is undefined, so successful requests count against the budget.
  - `audited` is `true`.

## Relationships
- `src/modules/example/module.ts` — the manifest under test (default import). Its `rateLimits` property is compared by identity with `exampleRateLimits`.
- `src/modules/example/events.ts` — supplies the `EXAMPLE_PUBLISHED` key used to look up the public-event projection.
- `src/modules/example/rate-limits.ts` — supplies `exampleRateLimits`, which is compared with the manifest's `rateLimits` and also inspected directly.
- `tests/support/stub.ts` — supplies `asStub` (imported as `@tests/stub`), used to pass a partial event payload typed as `never` into `toPublicEvent`.

## Notes
- The projection test uses `asStub<never>` with a partial payload (`exampleId`, `userId`, `title`), so it bypasses the event's real type.
- The `imageTargets` test comment-by-name says the key is the one "the digest job names". The test only checks the key list, not the digest job itself.
