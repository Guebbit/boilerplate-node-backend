---
source: src/modules/example/tests/unit/manifest.test.ts
sha256: 12a80f8be06722b3a190ad0241592951c2a319b29557d01ac64a88002f4fb345
generated_at: 2026-10-29T03:58:32.264900+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/unit/manifest.test.ts

## Purpose

Unit tests that pin down the example module's manifest contract: its name, mount path, public webhook projection, translatable fields, image-target registration, personal-data hooks, and rate-limit wiring. Exists to catch unintended changes to the surface the application (and `account`/`users` integrators) consume from the module.

## Key elements

- **`describe('the example manifest')`** — verifies:
  - `module.name` is `'example'` and it mounts at `/examples`.
  - `module.publicEvents[EXAMPLE_PUBLISHED].toPublicEvent` strips `userId`, keeping only `exampleId` and `title`.
  - `module.translatables.example` exposes only the `title` field under collection `'examples'`.
  - `module.imageTargets` is keyed by `'examples'`.
  - `module.personalData` declares a section named `'examples'` with an `erase` function.
  - `module.rateLimits` is the same reference as `exampleRateLimits`.
- **`describe('the creation budget')`** — asserts the single budget in `exampleRateLimits` is keyed by the authenticated account, reads its ceiling from `NODE_EXAMPLE_RATE_LIMIT_MAX`, is **not** skipped on success (`skipSuccessfulRequests` is `undefined`), and is audited on refusal.

## Relationships

- **`src/modules/example/module.ts`** — the system under test; every assertion reads a property of its default export.
- **`src/modules/example/events.ts`** — supplies the `EXAMPLE_PUBLISHED` constant used as the key into `module.publicEvents`.
- **`src/modules/example/rate-limits.ts`** — supplies `exampleRateLimits`, used both for an identity check against `module.rateLimits` and for the budget-shape assertions.

## Notes

- The public-event test casts the input payload `as never`, meaning the internal event shape is not typed in a way the test can express directly.
- `skipSuccessfulRequests` being `undefined` (not `false`) is the contract: the budget is spent on **every** attempt, success or not.
- The `userId`-stripping assertion is an intentional privacy guard — a regression here would leak owner identity to webhook subscribers.
