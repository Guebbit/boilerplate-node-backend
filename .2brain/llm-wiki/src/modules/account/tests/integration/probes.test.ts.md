---
source: src/modules/account/tests/integration/probes.test.ts
source_sha256: 4225016a39ee9ebb2cebaf007b06442e251b861af8bc038443676865c350d9a4
context_sha256: f81c829d04e363f1a22a915603ec951bad71500acf901699c0749670cb2575a0
generated_at: 2026-11-22T03:58:38.810856+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/probes.test.ts

## Purpose
Integration test that checks each request registered in `src/modules/account/probes.ts` actually returns the HTTP status its own name claims (e.g. `'Probe: 409 on a signup that already exists'` must answer 409). Probes are requests shipped in generated API client collections because the contract can't describe them. This test runs them against the real app instead of trusting the description.

## Key elements
- `setupTestDb()` — called at module level to prepare the test database.
- `claimedStatus(name)` — extracts the first three-digit number from a probe name via regex. Throws if none is found.
- `probeByName(name)` — looks up a probe in `probes` by exact name. Throws if missing, so a rename gets noticed.
- Test `401 with a bogus token` — sends a GET to `probe.path` with `Authorization: Bearer not.a.real.token`, then expects the claimed status.
- Test `409 on a signup that already exists` — creates a user with `createUser({ email: 'admin@example.com' })`. It then POSTs to `probe.path` with the probe's body, overridden with that user's email and `PLAIN_PASSWORD` as both `password` and `passwordConfirm`. It expects the claimed status.

## Relationships
- `src/modules/account/probes.ts` — supplies `probes` (each with `name`, `path`, and optionally `body`), which are the test subjects.
- `src/modules/users/tests/factories.ts` — supplies `createUser` and `PLAIN_PASSWORD` to seed the existing user for the 409 case.
- `tests/support/http.ts` — supplies `api()` (imported via `@tests/http`), the HTTP client used to hit the app.
- `tests/support/setup-test-db.ts` — supplies `setupTestDb` (imported via `@tests/setup-test-db`), which sets up the DB.

## Notes
- Only probes that can be reproduced with local fixtures are covered. Placeholders like `{{seedToken}}`, which resolve against the full demo dataset (`scenarios/subjects.ts`), are replaced by hand with an equivalent seeded row rather than applying the whole scenario.
- Probe names are lookup keys, so renaming a probe in `src/modules/account/probes.ts` makes this test fail with an explicit error.
- Assertions compare against the status parsed from the name, so the name is the single source of the expected status.
