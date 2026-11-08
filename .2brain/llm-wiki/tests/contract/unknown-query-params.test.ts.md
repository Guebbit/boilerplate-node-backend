---
source: tests/contract/unknown-query-params.test.ts
sha256: 573ac6c4f5bf04b7a45f15a417f15167fe6c04bb6586efdc6d718152f71b4f8f
generated_at: 2026-11-08T09:21:42.864801+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/unknown-query-params.test.ts

## Purpose

Contract test that enforces a **422 response** (not a silent no-op) when an undeclared query parameter is sent to any list-read route. It exists because a dropped filter can return the full result set as though the filter were honoured — a data-leak class of bug that is invisible to happy-path tests.

## Key elements

- **`LIST_ROUTES`** — `as const` array of eight staff-facing list endpoints (`/products`, `/orders`, `/users`, `/audit`, `/returns`, `/tasks`, `/webhooks/subscriptions`, `/api-keys`).
- **Parameterised 422/200 test** — `it.each(LIST_ROUTES)` sends the same `GET` twice per route: once clean (expects 200) and once with `?bogus=1` (expects 422). The control request proves the 422 is earned by the parameter, not by a broken route.
- **`actorUserId` regression test** — asserts `/audit?actorUserId=abc` returns 422. Guards against the documented-but-undeclared filter being silently ignored again.
- **Route-count guard** — `expect(LIST_ROUTES).toHaveLength(8)` prevents the suite from passing vacuously if routes are accidentally removed.

## Relationships

- **`tests/support/contract.ts`** — side-effect import (`import '@tests/contract'`); registers contract-test conventions/globals used by the suite.
- **`tests/support/http.ts`** — supplies `api()` (request builder) and `authenticateAsRole('admin')` (bearer-token helper) used in every test case.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the test database before the suite runs.

## Notes

- The `import '@tests/contract'` line has **no named bindings**; it is purely a side-effect import. Removing it (or misconfiguring the alias) will break the suite silently.
- The control-vs-stray pattern in each test is intentional: it isolates the 422 to the query parameter rather than to authentication or route availability.
- Adding a new list route requires appending it to `LIST_ROUTES` **and** updating the `toHaveLength(8)` assertion, or the guard test will fail.
