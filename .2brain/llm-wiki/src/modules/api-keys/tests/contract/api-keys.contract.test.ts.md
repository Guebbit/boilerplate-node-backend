---
source: src/modules/api-keys/tests/contract/api-keys.contract.test.ts
sha256: 20adbb8840cd84576605967a0c963c31c4445b6e6b2e3ea592ffeb39844905ad
generated_at: 2026-11-14T19:22:04.329961+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/contract/api-keys.contract.test.ts

## Purpose

Contract tests for the `/api-keys` admin surface (list, read, mint, revoke). Every request is validated against the bundled OpenAPI spec; the suite asserts status codes, response shape, security invariants (secret never leaked on GET), and validation boundaries. Credentials minted here are *exercised* against other routes in `tests/cross-cutting/`, not within this file.

## Key elements

- **`setupTestDb()`** — resets a fresh in-memory/test database before the suite runs.
- **`beforeEach`** — calls `accessService.ensureTenant(DEPLOYMENT_TENANT_SLUG, …)` so the caller's `tenantId` resolves; without it the `tenant` field on minted credentials would be undefined.
- **`afterEach`** — restores Jest real timers after the reauth-window test.
- **`ahead(days)` / `IN_A_WEEK()`** — local date-string helpers for expiry values in request bodies.
- **`mintOne(bearer)`** — POSTs a single credential and returns its `id`, reused across read/revoke tests.
- **`describe('GET /api-keys')`** — asserts 200, non-empty `items`, absence of `secret`, `status`/`actions` shape, `maxExpiresAt` > 364 days out, and sort-param validation (valid vs. 422).
- **`describe('GET /api-keys/:id')`** — reads back a single credential; asserts `actions.revoke` flips from `true` to `false` after DELETE; asserts 404 for both unknown and malformed IDs.
- **`describe('POST /api-keys')`** — verifies 201 + one-time `sk_…` secret, `cache-control: no-store`, permission-scope 422, empty-permissions 422, `REAUTH_REQUIRED` 401 (via frozen clock advanced past `reauthWindowSeconds('critical')`), missing-expiry 422, and the 365-day expiry ceiling (367 d → 422, 360 d → 201).
- **`describe('DELETE /api-keys/:id')`** — confirms 204 on successful revoke and 404 for an out-of-reach ID.

## Relationships

- **`tests/support/contract.ts`** — imported as a side-effect (`import '@tests/contract'`); installs the OpenAPI contract-matching harness that validates every response body and headers against the project's API spec.
- **`tests/support/http.ts`** — provides `api()` (a supertest-like request helper) and `authenticateAsRole()` (returns a bearer token for a given role).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises and tears down the test database.
- **`tests/support/clock.ts`** — `freezeDate()` / `advanceDate()` let the reauth-window test control "now" without waiting in real time.
- **`src/modules/access/index.ts`** — re-exports `accessService` and `DEPLOYMENT_TENANT_SLUG`; the suite calls `ensureTenant` so the caller context can resolve a `tenantId`.
- **`src/modules/access/services/index.ts`** — the service layer behind `accessService` (tenant provisioning).
- **`src/kernel/config.ts`** — source of `reauthWindowSeconds('critical')`, the threshold the frozen-clock test advances past to trigger `REAUTH_REQUIRED`.

## Notes

- The `secret` field is asserted **absent** on every GET response but **present** (and prefixed `sk_`) only on the initial POST 201. This is the primary security invariant the suite guards.
- The `cache-control: no-store` assertion on POST is intentional: the one-time secret must never be cached by intermediaries.
- The reauth test uses `freezeDate()` + `advanceDate()` rather than real waiting; the `afterEach` restores real timers so subsequent tests are unaffected.
- The permission-scope 422 test deliberately requests a *platform*-scope permission (`read:ObservabilitySnapshot`) to exercise the validation path that also catches genuinely missing permissions; the comment in-file explains why an admin still fails here.
- The sort-param test (`?sort=-lastUsedAt,expiresAt`) verifies comma-separated, negation-prefixed ordering; the 422 case (`?sort=name`) confirms the field-enum guard.
