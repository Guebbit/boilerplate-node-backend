---
source: tests/integration/scenarios/demo-restore.test.ts
sha256: c389922f0866d3980f529f6de288a88a183e53c1e638368655e6c515d756aada
generated_at: 2026-10-29T07:02:00.235637+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scenarios/demo-restore.test.ts

## Purpose

Integration test suite that exercises `restoreScenario('blank')` against a real database. It verifies three invariants of a restore: (1) it seeds exactly the named accounts, memberships, and locales with no shop data; (2) it preserves unique indexes (duplicate signup still returns 409); and (3) it does not strand the process-lifetime deployment-tenant cache.

## Key elements

- **`describe('the blank scenario')`** — asserts that after `restoreScenario('blank')`, the set of user emails equals exactly the keys in `seedCredentials`, memberships and locales exist, and products/orders are zero.
- **`describe('a restore never loses an index')`** — calls `restoreScenario('blank')` (which internally uses `emptyDatabase()`, not `dropDatabase()`), then issues two duplicate signups over HTTP and expects a 409 on the second.
- **`describe('a restore never strands the tenant cache')`** — calls `restoreScenario('blank')` twice, then hits `GET /account/abilities` as admin and asserts the returned `tenantId` matches `DEPLOYMENT_TENANT_ID`.
- **`setupTestDb()`** — top-level call that initialises the test database connection before any test runs.

## Relationships

- **`scenarios/support/demo.ts`** — imports `restoreScenario`, the function under test.
- **`scenarios/accounts.ts`** — imports `seedCredentials` as the single source of truth for which emails must (and only must) exist after a blank restore.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb` to configure the test database.
- **`tests/support/http.ts`** — provides `api` (HTTP client) and `authenticateAs` (bearer-token helper) for the two HTTP-driven tests.
- **`src/kernel/access/tenant.ts`** — imports `DEPLOYMENT_TENANT_ID` to assert the tenant cache is consistent post-restore.
- **`src/modules/users/model.ts`** — imports `userModel` for email-distinct and count assertions.
- **`src/modules/products/model.ts` / `src/modules/orders/model.ts`** — imports `productModel` / `orderModel` to assert absence of shop data.
- **`src/modules/locales/model.ts`** — imports `localeModel` to assert locales were seeded.
- **`src/modules/access/model.ts`** — imports `membershipModel` to assert role memberships exist.
- **`src/modules/users/tests/factories.ts`** — imports `PLAIN_PASSWORD` for the signup payloads.

## Notes

- The blank-scenario seeding test calls `restoreScenario` directly (not over HTTP) because the HTTP route is a thin wrapper mounted only by a dev server this suite does not boot. The index and tenant-cache tests deliberately go over real HTTP to exercise the actual defect surface (a unique index, a cached tenant id).
- The index test relies on `emptyDatabase()` rather than `dropDatabase()`; a drop would remove index definitions and mask the regression the test guards against.
- The tenant-cache test calls `restoreScenario` **twice** because the cache in `resolveDeploymentTenantId` is process-lifetime; the property under test is that a second restore still agrees with the cached value, not merely that the first one populated it.
- `seedCredentials` is treated as the authoritative account list; the test uses a set-equality check (sorted emails) rather than a fixed count so it keeps working if a new account is added.
