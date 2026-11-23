---
source: src/modules/account/tests/integration/no-store-conditional.test.ts
source_sha256: 82f59acf978cce47941fe239152b147823b1e8e36dcbd52cb7282bc1ccbc8781
context_sha256: 15734782a2660477def6808ea12388d4df4b92d6117c1194dac45ac552475d9a
generated_at: 2026-11-22T03:57:12.242059+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/no-store-conditional.test.ts

## Purpose
Integration test verifying that a `no-store` response still honors conditional requests. Per RFC 9110 §13.1.2, `no-store` binds caches, not the origin, so the origin must still evaluate `If-None-Match`. The account router mounts the `noStore` middleware, so `GET /account/sessions` serves as the probe.

## Key elements
- `setupTestDb()` — called at module level to prepare the test database.
- `describe('GET /account/sessions with its own tag')` with one test: *answers an empty 304 that keeps the ETag and no-store*.
  - Authenticates as `'user'` via `authenticateAs` and uses the returned `bearer` token.
  - Makes a warm-up request, then a second request to capture `first` and its `etag`.
  - Replays the request with `If-None-Match: <first etag>` and asserts:
    - status is `304`
    - body text is `''`
    - the `etag` header equals the first response's
    - `cache-control` is `no-store`

## Relationships
- `tests/support/http.ts` — supplies `api()` (HTTP client for requests) and `authenticateAs()` (returns a `bearer` Authorization value), imported via the `@tests/http` alias.
- `tests/support/setup-test-db.ts` — supplies `setupTestDb()`, imported via the `@tests/setup-test-db` alias.

## Notes
- The warm-up request exists because the session's `lastUsedAt` is throttled: the first read after sign-in may touch the row and change the body (and thus the ETag). Without it, the tag could be stale by the time of the conditional request.
- The test relies on the account router applying `noStore`; the endpoint is chosen for that reason, not for anything specific to sessions.
