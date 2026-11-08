---
source: src/modules/locales/tests/integration/manifest-visibility.test.ts
sha256: 7bacd2cac735f73499c4ee459538c134e2752a928703cfe66fad9ec3b903b956
generated_at: 2026-11-08T06:28:00.422706+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/manifest-visibility.test.ts

## Purpose

Integration test verifying that `GET /locales` reports a file-backed language (one with a deployed dictionary file such as `shared/locales/it.json`) as `active: false` when its database row is switched off, and as `active: true` when the row is active or absent entirely. This guards the contract that every manifest consumer (client bundling logic, sitemap generator, etc.) sees a consistent visibility signal regardless of authentication level.

## Key elements

- **`manifestTags(bearer?)`** — Helper that issues `GET /locales` (optionally with an `Authorization` header), asserts a 200 response, and returns the `[{ tag, active }]` pairs from the body.
- **`describe('GET /locales for a language with a deployed file that is switched off')`** — Three cases:
  - Switched-off file-backed language appears as `['it', false]` for both anonymous and admin callers.
  - Activating the locale via `POST /locales/it/activate` flips it back to `['it', true]` for visitors.
  - A file-backed language with **no** DB row at all still appears as `['it', true]` (the file's existence implies active by default).

## Relationships

- **`src/modules/locales/tests/factories.ts`** — Supplies `givenLocale`, which creates/updates the locale row in the test database (e.g. `givenLocale('it', { active: false })`).
- **`tests/support/http.ts`** — Supplies the `api()` request helper and `authenticateAs(role)` for obtaining bearer tokens.
- **`tests/support/setup-test-db.ts`** — Supplies `setupTestDb()`, called once at module top to provision a clean database for the suite.

## Notes

- The critical invariant under test is the *file-backed* aspect: a language that has a deployed JSON file will always appear in the manifest; only its `active` flag toggles. A purely DB-only language (no file) would presumably be absent entirely — that case is not covered here.
- The test asserts the same `['it', false]` result for both anonymous and admin callers, encoding the requirement that visibility is not role-gated at the manifest level.
- The module-level doc comment is the authoritative explanation of *why* the scoped read that drops a switched-off row is insufficient on its own — the file-backed merge re-introduces the language, so the code must explicitly set `active: false` rather than relying on row absence.
