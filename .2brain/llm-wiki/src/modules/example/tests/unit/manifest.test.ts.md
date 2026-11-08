---
source: src/modules/example/tests/unit/manifest.test.ts
sha256: 12a80f8be06722b3a190ad0241592951c2a319b29557d01ac64a88002f4fb345
generated_at: 2026-11-08T05:56:20.550779+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/unit/manifest.test.ts

## Purpose

Unit tests that pin down the public contract of the example module's manifest: what name it registers, which webhook fields are exposed, which fields are translatable, what personal-data hooks it declares, and which rate-limit budget governs creation. It exists so that refactors to `module.ts`, `events.ts`, or `rate-limits.ts` that silently change the manifest surface fail immediately.

## Key elements

- **`describe('the example manifest', …)`** — six assertions covering:
  - Module name (`'example'`) and plural mount path (`/examples`).
  - `publicEvents[EXAMPLE_PUBLISHED].toPublicEvent(…)` strips `userId` and keeps only `exampleId` + `title`.
  - `translatables.example` exposes exactly `['title']` and the `'examples'` collection.
  - `imageTargets` has a single key, `'examples'` (matches the digest job's expected name).
  - `personalData` is an array whose first entry has `section: 'examples'` and a callable `erase`.
  - `module.rateLimits` is referentially identical (`toBe`) to `exampleRateLimits`.
- **`describe('the creation budget', …)`** — asserts the first entry of `exampleRateLimits`:
  - Env-var name is `NODE_EXAMPLE_RATE_LIMIT_MAX`.
  - Keyed by `'the authenticated account'`.
  - `skipSuccessfulRequests` is `undefined` (budget is consumed on success by default).
  - `audited` is `true` (refusals are logged).

## Relationships

- **`src/modules/example/module.ts`** — the system under test; the file reads `name`, `mounts`, `publicEvents`, `translatables`, `imageTargets`, `personalData`, and `rateLimits` off its default export.
- **`src/modules/example/events.ts`** — supplies the `EXAMPLE_PUBLISHED` constant used to index into `module.publicEvents`.
- **`src/modules/example/rate-limits.ts`** — supplies `exampleRateLimits`; the test both asserts referential identity with the manifest and inspects its first budget entry.

## Notes

- `toPublicEvent` is called with an `as never` cast; the real input type is wider than the test's inline object, so the test bypasses structural checking.
- `toBe` (not `toEqual`) is used for the rate-limits assertion, deliberately catching the case where `module.ts` spreads or copies the array instead of reusing the shared reference.
- `skipSuccessfulRequests` is asserted as `undefined`, not `false` — the codebase treats "absent" as "count successes" and a missing key as distinct from an explicit `false`.
