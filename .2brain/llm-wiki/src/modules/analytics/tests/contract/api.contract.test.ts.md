---
source: src/modules/analytics/tests/contract/api.contract.test.ts
source_sha256: 3a6e100dd041e2f8bcd28f68d29b1638514122517ebfc711e5bd8d974079740f
context_sha256: 5dcf1a4b1c0732691af0e24f2d27740c1bd042d5b6064928f296a51e5efd56a5
generated_at: 2026-11-22T04:18:38.452348+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/analytics/tests/contract/api.contract.test.ts

## Purpose
Contract tests for `POST /analytics/events`. They check that the two events in the contract are accepted with `204`, and that any event outside that closed set is refused with `422`.

## Key elements
- `setupTestDb()` is called at module level to prepare the test database for this suite.
- `describe('POST /analytics/events')` groups three cases, each sending a request through `api()`:
  - `product_viewed` with a `productId` returns `204`.
  - `products_searched` with `text`, `resultCount` and `page` returns `204`.
  - An unknown event (`order_created`) returns `422`.

## Relationships
- `@tests/contract` (`tests/support/contract.ts`) is imported for its side effects only. Nothing from it is used by name.
- `@tests/setup-test-db` (`tests/support/setup-test-db.ts`) provides `setupTestDb`, which is called once when the file loads.
- `@tests/http` (`tests/support/http.ts`) provides `api()`, the HTTP client used to issue the `POST` requests.

## Notes
- The tests assert only the status codes. They do not check response bodies or that anything was stored.
- `describe`, `it` and `expect` are used without being imported, so they come from the test runner's globals.
