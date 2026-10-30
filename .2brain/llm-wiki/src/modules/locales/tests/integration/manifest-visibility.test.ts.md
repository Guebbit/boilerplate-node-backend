---
source: src/modules/locales/tests/integration/manifest-visibility.test.ts
sha256: 7bacd2cac735f73499c4ee459538c134e2752a928703cfe66fad9ec3b903b956
generated_at: 2026-10-29T04:25:56.924001+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/manifest-visibility.test.ts

## Purpose

Integration test verifying that `GET /locales` reports a file-backed language (one with a deployed dictionary like `shared/locales/it.json`) as `active: false` once its database row is switched off, for both anonymous visitors and authenticated staff. It also confirms the language reappears as active after re-activation, and that a file-backed language with no row at all still defaults to `active: true`.

## Key elements

- **`manifestTags(bearer?)`** — local helper that calls `GET /locales` (optionally with an `Authorization` header), asserts a 200 response, and returns the array of `[tag, active]` tuples for easy assertion.
- **`describe('GET /locales for a language with a deployed file that is switched off')`** — the single test suite with three cases:
  - *lists it as off, for a visitor and for staff alike* — creates a deactivated `it` row, asserts both anonymous and admin callers see `['it', false]` while `en` stays `true`.
  - *offers it again to a visitor once it is switched on* — deactivates `it`, then `POST /locales/it/activate` as admin, and asserts the visitor manifest shows `['it', true]`.
  - *still offers a file-backed language that has no row at all* — no row created; expects `['it', true]` purely from the file.

## Relationships

- **`src/modules/locales/tests/factories.ts`** — imports `givenLocale`, used to insert a locale row (e.g. `it` with `active: false`) into the test database.
- **`tests/support/http.ts`** — imports `api()` (supertest-style request builder) and `authenticateAs()` (returns a bearer token for a given role such as `'admin'`).
- **`tests/support/setup-test-db.ts`** — imports and calls `setupTestDb()` at module top-level to prepare/reset the test database before the suite runs.

## Notes

- The module JSDoc comment is the authoritative explanation of the bug this test guards against: without the override, a file-backed language would surface as `active: true` in the scoped read even after its row is deactivated, because the file's mere existence implies availability. The test locks in the "override to `false`" behavior for all callers.
- `manifestTags` always asserts a 200 status internally; individual tests only assert on the tag/active pairs, so a non-200 response fails in the helper rather than at the test level.
