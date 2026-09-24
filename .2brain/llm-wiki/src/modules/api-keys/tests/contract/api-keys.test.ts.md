---
source: src/modules/api-keys/tests/contract/api-keys.test.ts
sha256: 4eeb066c86da57b43d4c912dfd589ab0f9d2e53676d7c89955ddcc584f4b729e
generated_at: 2026-09-23T18:25:38.766227+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/contract/api-keys.test.ts

## Purpose

Contract tests for the `/api-keys` admin surface (list, mint, revoke). Each response is asserted both for expected status/body **and** for conformance to the bundled `openapi.yaml` via `toSatisfyApiSpec()`. Credentials minted here are intentionally _not_ reused against other routes in this file; cross-cutting usage lives in `tests/cross-cutting/`.

## Key elements

- **`beforeEach` → `ensureTenant(DEPLOYMENT_TENANT_SLUG, …)`** — guarantees the deployment's shop exists so the `tenant` field (`context.caller.tenantId`) resolves during real auth.
- **`describe('GET /api-keys')`** — 401 unauthenticated; 403 for a `customer` role (no `apikeys` permission); 200 listing where every item's `secret` is `undefined`.
- **`describe('POST /api-keys')`** — 201 mint (secret starts with `sk_`, permissions echoed back); 422 for a platform-scope permission the admin doesn't hold; 422 for an empty `permissions` array; 403 for `customer`.
- **`describe('DELETE /api-keys/:id')`** — 200 revoke of a just-minted id; 404 for an id outside the admin's tenant scope.
- **`toSatisfyApiSpec()`** (from `@tests/contract`) — custom matcher run on every response to validate the shape against the OpenAPI spec.

## Relationships

- **`tests/support/contract.ts`** — imported as `@tests/contract`; registers the `toSatisfyApiSpec()` matcher used in every assertion.
- **`tests/support/http.ts`** — provides `api()` (supertest-style HTTP client) and `authenticateAsRole(role)` (injects a bearer token for a given role).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module top-level to initialise/isolate the test database.
- **`src/modules/access/index.ts`** — source of `ensureTenant` and `DEPLOYMENT_TENANT_SLUG` used in the `beforeEach` tenant bootstrap.
- **`src/modules/access/service.ts`** — underlying authorization logic that the role-based 403/422 assertions exercise (admin vs. customer permission floors).

## Notes

- The 422 "over-reaching permission" test uses `platform.observability.any.read` as a _proxy_ for a genuinely missing permission: admin is unrestricted in **tenant** scope but not in **platform** scope, so the 422 path is identical.
- The `tenant` field on a credential is only resolved after the deployment's shop exists (same precondition as the webhooks contract suite). Forgetting the `ensureTenant` call causes auth to fail before the API-key logic is reached.
- Every test pairs a conventional status/body assertion with `toSatisfyApiSpec()`; omitting the matcher means the OpenAPI shape is unchecked for that response.
