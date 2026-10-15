---
source: tests/contract/unknown-query-params.test.ts
sha256: 3305ab2983372e814e7ee3825ec49a4bb095fdab617bd56599bb4c7c8a0f0756
generated_at: 2026-10-15T12:34:13.585114+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/unknown-query-params.test.ts

## Purpose

Contract test that verifies every list-read route rejects an unknown query parameter with HTTP 422 instead of silently dropping it (which would return unfiltered data as if the filter had been applied). Includes a targeted regression for the `actorUserId` filter that was documented for the audit endpoint but never declared in its schema.

## Key elements

- **`LIST_ROUTES`** — const array of the 8 list-read paths (`/products`, `/orders`, `/users`, `/audit`, `/returns`, `/feedback`, `/webhooks/subscriptions`, `/api-keys`).
- **`it.each(LIST_ROUTES)` block** — for each route: sends a control GET (expect **200**) and a GET with `?bogus=1` (expect **422**), proving the 422 is caused by the parameter, not by the route itself.
- **`actorUserId` regression test** — hits `/audit?actorUserId=abc` and asserts 422; documents a past gap where the param was written in the data-protection page but ignored by the handler.
- **Route-count guard** — asserts `LIST_ROUTES.length === 8` so the suite cannot pass vacuously if the array is accidentally truncated.

## Relationships

- **`tests/support/contract.ts`** — side-effect import (`import '@tests/contract'`) that presumably registers shared contract-test globals or expectations.
- **`tests/support/http.ts`** — supplies `api` (a request helper, Supertest-style) and `authenticateAsRole` (returns a bearer token for the given role; here always `'admin'`).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module level to provision a clean test database before any test runs.

## Notes

- The control request (same URL minus the stray param → 200) is load-bearing: without it, a 422 could be misread as a route-level rejection.
- All requests authenticate as **admin**; the test does not cover other roles.
- Adding a new list-read route requires appending it to `LIST_ROUTES` *and* updating the count assertion (currently hard-coded to 8).
