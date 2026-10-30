---
source: tests/contract/unknown-query-params.test.ts
sha256: 2a6de94d45a96426f3ab475b0f20fa34fa53d7b12007ae15380cef78d43dfebb
generated_at: 2026-10-29T06:41:26.477445+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/unknown-query-params.test.ts

## Purpose

Contract test verifying that list endpoints reject unknown query parameters with a **422** instead of silently dropping them and returning unfiltered data. Each route is paired with a control request (same path, no stray param → 200) so the 422 is attributable to the parameter, not to a route that rejects everything. Guards against a class of bug where a typo'd or stale filter name is ignored and the caller receives the full table as though the filter had been honoured.

## Key elements

- **`LIST_ROUTES`** (`as const` array) – the eight list endpoints under test: `/products`, `/orders`, `/users`, `/audit`, `/returns`, `/tickets`, `/webhooks/subscriptions`, `/api-keys`.
- **`it.each(LIST_ROUTES)`** – parametrized test: for every route, asserts `[200, 422]` for a clean GET vs. a GET with `?bogus=1`.
- **`it('refuses the documented-but-undeclared actorUserId filter…')`** – targeted regression test: `GET /audit?actorUserId=abc` must return 422 (this filter was documented in the data-protection page but never declared on the route).
- **`it('counts exactly eight list routes…')`** – sanity guard: `expect(LIST_ROUTES).toHaveLength(8)` so an accidentally emptied array cannot produce a vacuous pass.
- **`setupTestDb()`** – initializes the test database before the suite runs.
- **`authenticateAsRole('admin')` / `api()`** – obtained from the HTTP support module; used to issue authenticated requests.

## Relationships

- **`tests/support/contract.ts`** – imported for side-effect (`import '@tests/contract'`); likely registers contract-test globals or assertions used across the suite.
- **`tests/support/http.ts`** – supplies `api()` (request builder) and `authenticateAsRole()` (token acquisition), both called directly in every test case.
- **`tests/support/setup-test-db.ts`** – supplies `setupTestDb()`, called once at module level to prepare a clean database before any request is made.

## Notes

- The "bogus" parameter is intentionally arbitrary (`?bogus=1`); the contract is that *any* undeclared parameter is rejected, not a specific one.
- The control request (no param → 200) is essential: without it a route that 404s or 403s on everything would still satisfy the 422 assertion.
- The count test (`toHaveLength(8)`) is a tripwire against copy-paste regressions that delete entries from `LIST_ROUTES` and let the suite pass silently.
- Uses the `admin` role for every route; the contract under test is parameter validation, not authorization, so no per-route role variation is needed here.
