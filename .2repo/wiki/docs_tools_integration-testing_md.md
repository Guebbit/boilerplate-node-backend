# docs/tools/integration-testing.md

## Purpose

Documents the integration testing layer: the suite that drives the real `src/app.ts` Express app via `supertest` to verify wiring (middleware order, auth gates, routing) without asserting on business logic or requiring a live database. It also covers the second half of the tier — module-level tests under `src/modules/*/tests/integration/` that exercise real Mongoose behaviour.

## Key elements

- **`tests/integration/app-health.test.ts`** — the sole HTTP integration test file; covers system/observability routes (`GET /`, `404` fallback, Prometheus metrics, SSE events, and `401` auth-gate checks on unauthenticated paths).
- **`api()` in `tests/support/http.ts`** — shared `supertest(app)` wrapper; also consumed by the contract-testing and contract-request-data suites.
- **`src/app.ts`** — the app under test; skips auto-listen, Mongo, Redis, and queue bootstrap when `NODE_ENV === 'test'`.
- **`npm run test:integration`** — runs `jest tests/integration --runInBand`.
- **`src/modules/*/tests/integration/`** — module-level tests that call `setupTestDb()` and exercise Mongoose models directly (schema validation, defaults, indexes); excluded from Stryker mutation runs via `testPathIgnorePatterns`.

## Relationships

- **`docs/tools/index.md`** — the directory index page that lists and links to this file as one of the testing-tier documentation pages.

## Notes

- Coverage is deliberately limited to routes that need neither a database nor Redis; routes requiring persisted data are handled by the contract-testing and contract-request-data suites (same `api()` harness, different assertions).
- The SSE endpoint (`/observability/events`) is read by aborting after the first chunk because `supertest` buffers the entire response body.
- Auth-gate tests assert `401` specifically (not `404`/`500`) to prove the middleware is mounted on the path.
- A prior version assembled a private Express app as a stand-in for `src/app.ts` due to a Jest/TypeScript compilation issue (`import.meta`, subpath exports); that blocker is resolved via `tsconfig.jest.json`'s `module: "node16"`, and the duplicate app was removed.
- DB-requiring tests are placed in the integration tier (not unit) because Stryker reruns the unit suite once per mutant, making a live DB connection prohibitively expensive at that cadence.
