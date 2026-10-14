---
source: src/modules/api-keys/tests/contract/api-keys.test.ts
sha256: 35323cc6925b5c7c14081e96860665469e85f0bd07b0b882b0378ee9c02b5d75
generated_at: 2026-10-14T15:02:06.163176+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/contract/api-keys.test.ts

## Purpose

Contract tests for the `/api-keys` admin surface (GET list, POST mint, DELETE revoke), validated against the bundled `openapi.yaml`. Every route requires a human bearer session; the credentials minted here are *not* exercised against other routes — that happens in `tests/cross-cutting/`.

## Key elements

- **`setupTestDb()`** — initialises the in-memory test database before any test runs.
- **`beforeEach` → `ensureTenant(DEPLOYMENT_TENANT_SLUG, …)`** — creates the deployment's shop so that `context.caller.tenantId` resolves to a string (same setup the webhooks contract suite needs).
- **`ahead(days)` / `IN_A_WEEK()`** — local helpers that produce ISO-8601 expiry timestamps (N days out / one week out, safely under the one-year ceiling).
- **`describe('GET /api-keys')`** — 401 (no auth), 403 (role without `apikeys` key), 200 listing with `secret` asserted absent on every item.
- **`describe('POST /api-keys')`** — 201 mint (secret starts with `sk_`, permissions echoed), `Cache-Control: no-store`, 422 for over-scoped / empty / missing / too-far expiry, 401 `REAUTH_REQUIRED` after the reauth window elapses, 403 for unauthorised role.
- **`describe('DELETE /api-keys/:id')`** — 200 revoke, 404 for an id outside the caller's reach.
- **`afterEach` → `jest.useRealTimers()`** — restores the timer mock used by the reauth-window test.

## Relationships

- **`tests/support/contract.ts`** — side-effect import (`import '@tests/contract'`); registers the OpenAPI contract-assertion harness that makes every response shape-check against `openapi.yaml`.
- **`tests/support/http.ts`** — provides the `api()` HTTP client and `authenticateAsRole(role)` helper used to obtain bearer tokens per test.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` resets and seeds the test database before the suite runs.
- **`tests/support/clock.ts`** — `freezeDate()` / `advanceDate(ms)` let the REAUTH_REQUIRED test deterministically push the clock past the reauth window.
- **`src/kernel/config.ts`** — supplies `reauthWindowSeconds('critical')`, the exact threshold the clock-advance test must exceed by one second.
- **`src/modules/access/index.ts`** — re-exports `ensureTenant` and `DEPLOYMENT_TENANT_SLUG` used in the `beforeEach` to guarantee a tenant context exists.

## Notes

- The `@tests/contract` import is deliberately bare (no bindings); its sole effect is to wire up OpenAPI validation. Removing it would silently disable contract assertions.
- The 422 "over-reaching permission" test uses a **platform-scope** key (`platform.observability.any.read`) as a stand-in for "a permission the caller genuinely lacks." The comment in-file explains that an admin is unrestricted within tenant scope, so only a platform-scope request triggers the same 422 path.
- The one-year expiry boundary is tested with 367 days (→ 422) and 360 days (→ 201), implying the ceiling is 365 days.
- `reauthWindowSeconds` is called with the `'critical'` severity argument; other severities may have different windows — only this one is exercised here.
