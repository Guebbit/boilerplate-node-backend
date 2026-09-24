---
source: tests/integration/app/demo-restore.test.ts
sha256: 5831486ea087b94588a45aa890ba7a5ceb27cb17e47cf9b6e08d6884c81cc68e
generated_at: 2026-09-23T20:02:33.905479+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/app/demo-restore.test.ts

## Purpose

Integration test for `restoreScenario('blank')` from `src/app/demo.ts`. Verifies three invariants of the restore path against a real database: (1) the blank scenario seeds only the named accounts, memberships, and locales with no shop data; (2) the restore preserves the unique email index; (3) repeated restores keep the process-lifetime tenant cache consistent with the database. Exercises `restoreScenario` as a direct function call, then drives the resulting state over real HTTP to confirm the invariants hold at the API boundary.

## Key elements

- **`describe('the blank scenario')`** — Calls `restoreScenario('blank')`, then asserts: user emails exactly match `seedCredentials` (no filler), `membershipModel` and `localeModel` are non-empty, `productModel` and `orderModel` are empty.
- **`describe('a restore never loses an index')`** — After a blank restore, issues two signups with the same email via `POST /account/signup`; expects the second to return **409** and the user collection to contain exactly one document for that email.
- **`describe('a restore never strands the tenant cache')`** — Calls `restoreScenario('blank')` **twice**, then `GET /account/abilities` (authenticated as `admin`) and asserts `response.body.data.tenantId === DEPLOYMENT_TENANT_ID`.

## Relationships

- **`src/app/demo.ts`** — Under test. `restoreScenario` is the function under exercise.
- **`scenarios/accounts.ts`** — Provides `seedCredentials`, the authoritative list of expected seeded accounts used to verify no extra users were inserted.
- **`src/kernel/access/tenant.ts`** — Exports `DEPLOYMENT_TENANT_ID`, the pinned constant the tenant-cache test asserts against.
- **`src/modules/users/model.ts`** — `userModel` used for the email-distinct check and the duplicate-count assertion.
- **`src/modules/products/model.ts`** / **`src/modules/orders/model.ts`** — `productModel`, `orderModel` asserted empty in the blank scenario.
- **`src/modules/locales/model.ts`** — `localeModel` asserted non-empty.
- **`src/modules/access/model.ts`** — `membershipModel` asserted non-empty (roles live in YAML; memberships are the DB artifact).
- **`src/modules/users/tests/factories.ts`** — Supplies `PLAIN_PASSWORD` for the signup request payloads.
- **`tests/support/http.ts`** — `api()` and `authenticateAs` for all HTTP-level assertions.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` runs once before the suite to provision the test database.

## Notes

- The test calls `restoreScenario` directly rather than through the `installDemo` HTTP route because that route is gated behind `enableDemoProfile()` at import time — a condition this suite intentionally does not trigger.
- The index test relies on `restoreScenario` using `emptyDatabase()` (truncate + reseed) rather than `dropDatabase()`. A full drop would also discard each collection's index builds, making the 409 assertion vacuous.
- The tenant-cache test invokes `restoreScenario` **twice** on purpose: the cache in `resolveDeploymentTenantId` lives for the process lifetime, so the first call populates it and the second proves a subsequent restore still agrees with it.
- Role documents are no longer persisted (they reside in shared YAML configuration); the test therefore asserts on **memberships** (account-to-role links) rather than on role counts.
