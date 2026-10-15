---
source: tests/integration/scenarios/demo-restore.test.ts
sha256: 1d4184597f0d52a075578442503c8c90ede0afb490910d01bd980f5ced0f7270
generated_at: 2026-10-15T12:52:51.029988+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scenarios/demo-restore.test.ts

## Purpose

Integration test suite that exercises `restoreScenario('blank')` against a real database. It verifies three properties: the restore seeds only the named accounts/memberships/locales (no shop data), the unique `users_email` index survives a restore, and the process-lifetime deployment-tenant cache is not stranded after a restore. The last two cases drive real HTTP (`/account/signup`, `/account/abilities`) because the defects they close live in the index and the cached tenant id, not in the helper's internals.

## Key elements

- **`setupTestDb()`** — provisions a clean per-suite database (called once at module scope).
- **`describe('the blank scenario')`** — calls `restoreScenario('blank')` directly as a function; asserts the seeded user emails match exactly `seedCredentials`, that `membershipModel` and `localeModel` have documents, and that `productModel` and `orderModel` are empty.
- **`describe('a restore never loses an index')`** — restores, then issues two `POST /account/signup` calls with the same email via `api()`; asserts the second returns **409** and only one user row exists (proving `users_email`'s unique index survived).
- **`describe('a restore never strands the tenant cache')`** — restores **twice** (cache is process-lifetime), authenticates as `admin` via `authenticateAs`, and asserts `GET /account/abilities` returns `tenantId === DEPLOYMENT_TENANT_ID`.

## Relationships

- **`scenarios/support/demo.ts`** — imports `restoreScenario`, the function under test.
- **`scenarios/accounts.ts`** — imports `seedCredentials`; the test treats this map as the single source of truth for "exactly which logins should exist."
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` isolates each suite on a fresh database.
- **`tests/support/http.ts`** — `api()` and `authenticateAs()` provide the Supertest-style HTTP client and bearer-token helper used by the two HTTP-driven cases.
- **`src/modules/users/model.ts`** — `userModel` is queried for email distinctness and row counts.
- **`src/modules/products/model.ts` / `src/modules/orders/model.ts`** — `productModel` / `orderModel` are asserted to be empty after a `blank` restore.
- **`src/modules/locales/model.ts`** — `localeModel` count is asserted > 0.
- **`src/modules/access/model.ts`** — `membershipModel` count is asserted > 0 (roles live in shared YAML; only memberships are seeded).
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` is the expected value in the `/account/abilities` response.
- **`src/modules/users/tests/factories.ts`** — `PLAIN_PASSWORD` is the password used in signup requests.

## Notes

- The first case calls `restoreScenario` as a **function**, not over HTTP. The HTTP route is a thin wrapper mounted only by `scenarios/run-server.ts`; this suite deliberately does not boot that server.
- The index-preservation test relies on `emptyDatabase()` (used inside `restoreScenario`) rather than `dropDatabase()`. A full drop would also remove the index build, masking the defect.
- The tenant-cache test restores **twice** on purpose: the first restore may coincidentally populate the cache correctly; the second proves the cache still agrees after a state change.
- Roles are no longer stored as documents; the shared YAML holds presets. The test therefore asserts `membershipModel` rows exist, not a `roleModel` count.
- `toSorted()` is used (ES2023+); the project targets a Node runtime that supports it.
