---
source: src/modules/api-keys/tests/contract/api-keys.test.ts
sha256: aca3bb5b96d013b6850f8d36bc5463824d95759808a64ef887d21964e0650ed8
generated_at: 2026-10-15T10:20:58.541818+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/contract/api-keys.test.ts

## Purpose

Contract tests for the three `/api-keys` admin routes (list, mint, revoke), verifying observable behavior against the bundled `openapi.yaml`. Every route requires a human bearer session; the API keys minted here are **not** exercised against other routes — that cross-cutting coverage lives in `tests/cross-cutting/`.

## Key elements

- **`ahead(days)`** / **`IN_A_WEEK()`** — local helpers that produce ISO-8601 expiry strings (N days from now / 7 days out). Used to satisfy or violate the one-year mint ceiling.
- **`beforeEach` → `ensureTenant(DEPLOYMENT_TENANT_SLUG, …)`** — creates the deployment's shop so that `context.caller.tenantId` resolves to a real tenant during login. Mirrors the setup the webhooks contract suite needs.
- **`describe('GET /api-keys')`** — asserts 401 (unauthenticated), 403 (role without the `apikeys` key), and 200 listing that never exposes `secret`.
- **`describe('POST /api-keys')`** — covers: 201 mint returning a one-time `sk_…` secret; `cache-control: no-store`; 422 for a platform-scope permission the caller lacks, empty permissions list, missing `expiresAt`, and `expiresAt` > 365 days (367 vs 360 boundary); 401 `REAUTH_REQUIRED` when the session age exceeds `reauthWindowSeconds('critical')`; 403 for a role without the key.
- **`describe('DELETE /api-keys/:id')`** — 200 revoke of a self-created key; 404 for an id outside the caller's reach.
- **`afterEach`** — restores real Jest timers (the reauth test freezes/advances the clock).

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Imported for side-effect (`import '@tests/contract'`); sets up the contract-test harness (likely OpenAPI schema validation middleware). |
| `tests/support/setup-test-db.ts` | `setupTestDb()` called at module scope to seed/verify a clean database before the suite runs. |
| `tests/support/http.ts` | Provides `api()` (supertest-style request builder) and `authenticateAsRole()` used by every test. |
| `tests/support/clock.ts` | `freezeDate` / `advanceDate` used in the REAUTH_REQUIRED test to simulate session age. |
| `src/modules/access/index.ts` | Exports `ensureTenant` and `DEPLOYMENT_TENANT_SLUG`, used in `beforeEach` to create the tenant context. |
| `src/kernel/config.ts` | Exports `reauthWindowSeconds('critical')`, the threshold the clock-advance test must exceed. |

## Notes

- `setupTestDb()` runs **once at module level**, not in `beforeEach` — the suite assumes a single fresh DB per file.
- The 422 "permission the caller does not hold" test deliberately uses a **platform-scope** key (`platform.observability.any.read`) rather than a truly missing tenant-scope key, because admin is unrestricted within tenant scope. The comment flags this subtlety.
- The expiry ceiling is exactly **one year (365 days)**: 367 days → 422, 360 days → 201. The boundary is inclusive of 365.
- The REAUTH_REQUIRED test depends on `reauthWindowSeconds('critical')` from kernel config — if that value changes, the clock-advance delta in the test must follow.
- The `tenant` field on a minted credential is resolved from `context.caller.tenantId`; without the `ensureTenant` setup the login would not produce a resolvable tenant, causing spurious failures unrelated to the API-key logic under test.
