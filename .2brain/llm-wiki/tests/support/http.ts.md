---
source: tests/support/http.ts
sha256: 75b1ebc502c1ba77634726ec0cac00cfaf1c5e60442c8c19b77857dcfd2bf976
generated_at: 2026-09-27T16:00:20.569805+00:00
model: ollama:qwen3.8:27b
---

# tests/support/http.ts

## Purpose

HTTP-level test harness that drives the Express app the same way a real client would — through routing, middleware, auth, serialization, and the error handler. This is the layer where a response can be compared to `openapi.yaml`, filling the gap that unit suites (which call services/repositories directly) cannot cover.

## Key elements

- **`app`** (module-level, not exported) — the single Express instance built by `createApp()` from `src/app.ts`. Shared across every test in the process; no server, no Mongo, no Redis, no queue are started.
- **`api()`** — returns a fresh `supertest` agent against the shared `app`, for a single request.
- **`AuthenticatedTestUser`** (interface) — the shape every auth helper resolves to: `{ user: UserDocument; token: string; bearer: `Bearer ${string}` }`.
- **`authenticateAs(role?: 'admin' | 'user')`** — creates a user (admin or customer, both pre-verified) via the user factories, then logs in through the real `POST /account/login` route and returns the token. The default path most tests reach for.
- **`authenticateAsRole(role: string)`** — same flow but for arbitrary TENANT role names (`manager`, `warehouse`, `support`, etc.). Uses a distinct email/username per role so multiple roles can coexist in one test without duplicate-key errors.
- **`authenticateUser`** (internal) — shared login round-trip: POSTs credentials, asserts 200, extracts `body.data.token`, throws a descriptive error otherwise.

## Relationships

- **`src/app.ts`** — sole production-code import; `createApp()` is called once at module load to produce the shared `app`.
- **`@modules/users/tests/factories`** — provides `createUser`, `createAdminUser`, and `PLAIN_PASSWORD` used to seed accounts before login.
- **Consumer test files** (account contract tests, account integration tests, antibot, api-keys, audit-logs contract tests) — all import `api()` and/or `authenticateAs`/`authenticateAsRole` to issue authenticated HTTP requests and assert on the response body.

## Notes

- **One app per process.** There is no per-test teardown or re-creation; tests share the same Express instance and the same in-memory Mongo (set up elsewhere via `setupTestDb()`). State isolation between tests is the test's responsibility.
- **Redis is a no-op in tests.** `getCacheValue` resolves `undefined` on any failure, so every request behaves as a cache miss. No Redis server is needed.
- **Login is always via the real endpoint.** Tokens are never hand-signed in tests; if login regresses, every contract test fails loudly.
- **`authenticateAs` defaults to a verified customer.** Tests that need UNVERIFIED behaviour must build their own user (e.g., `createUser({}, 'unverified')`) rather than relying on this helper.
- **`authenticateAsRole` is for the contract sweep.** It exists so a single test can exercise every preset role through the HTTP surface; the distinct-per-role email prevents the "duplicate-key" error that would occur with the factory's shared default address.
