---
source: tests/integration/scenarios/demo-restore.test.ts
sha256: 592c2f93cdcfcf3f02f27be4914683fea0f32b4430b12d5e63ee621a7639effb
generated_at: 2026-11-08T09:47:01.890362+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scenarios/demo-restore.test.ts

## Purpose

Integration suite that exercises `restoreScenario('blank')` against a real database. It verifies three properties of the blank-scenario restore: (1) only the named accounts, memberships, and locales are seeded (no shop data), (2) the `users_email` unique index survives so a duplicate signup still returns 409, and (3) the process-lifetime tenant-ID cache remains consistent across repeated restores.

## Key elements

- **`describe('the blank scenario')`** — calls `restoreScenario('blank')`, then asserts via Mongoose models that the set of seeded emails exactly matches `seedCredentials`, that memberships and locales exist, and that products and orders are zero.
- **`describe('a restore never loses an index')`** — calls `restoreScenario('blank')`, then drives two real `POST /account/signup` requests through `api()` with the same email; expects the second to return 409 and the DB to hold exactly one document.
- **`describe('a restore never strands the tenant cache')`** — calls `restoreScenario('blank')` **twice**, authenticates as `admin`, and asserts `GET /account` returns `DEPLOYMENT_TENANT_ID` in `body.abilities.tenantId`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/support/demo.ts` | Source of `restoreScenario`, the function under test. |
| `scenarios/accounts.ts` | Provides `seedCredentials`, the canonical account list used as the assertion baseline. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` — boots a real MongoDB and ensures `emptyDatabase()` (not `dropDatabase()`) runs before each suite. |
| `tests/support/http.ts` | `api()` and `authenticateAs` — the Supertest-based HTTP client used for the index and tenant-cache cases. |
| `src/kernel/access/tenant.ts` | Exports `DEPLOYMENT_TENANT_ID`, the expected tenant-id value in the cache assertion. |
| `src/modules/users/model.ts` | `userModel` — queried for email distincts and document counts. |
| `src/modules/access/model.ts` | `membershipModel` — counted to confirm roles are materialized. |
| `src/modules/locales/model.ts` | `localeModel` — counted to confirm locales are seeded. |
| `src/modules/products/model.ts` | `productModel` — asserted to be zero in the blank scenario. |
| `src/modules/orders/model.ts` | `orderModel` — asserted to be zero in the blank scenario. |
| `src/modules/users/tests/factories.ts` | `PLAIN_PASSWORD` — the password literal used in signup payloads. |

## Notes

- **Function call, not HTTP route.** The test imports `restoreScenario` directly. The HTTP endpoint that wraps it (`/scenarios/restore`) is mounted only by `scenarios/run-server.ts`, which this suite deliberately does not boot.
- **`emptyDatabase()` vs. `dropDatabase()`.** The setup uses `emptyDatabase()` (via `setupTestDb`), which preserves index definitions. A full `dropDatabase()` would destroy the `users_email` unique index and make the 409 assertion in the index test pass for the wrong reason.
- **Double restore in the tenant test.** The tenant-ID cache in `resolveDeploymentTenantId` lives for the process lifetime. Calling `restoreScenario` twice ensures the assertion tests that the *second* restore still agrees with the cache, not merely that the first populated it.
- **`seedCredentials` as the rule.** The email-set assertion is compared against `Object.values(seedCredentials)` rather than a hardcoded array or count, so it stays correct if a fifth account is added to the scenario definition.
- **Roles are not stored per-tenant.** The test asserts on `membershipModel` counts, not a `roleModel`, because role presets now live in a shared YAML file.
