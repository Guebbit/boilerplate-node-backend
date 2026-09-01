# src/modules/feedback/tests/contract/api.contract.test.ts

## Purpose

Contract tests for all `/feedback` endpoints. The feedback module is the only resource with a genuinely public write endpoint (`POST /feedback/contact`, `security: []`) alongside admin-only routes. These tests guard that the public response carries no admin fields, that admin routes return 401/403 rather than leaking data, and that every response (success and error) satisfies the published API spec. Records are created through the public endpoint itself because no fixture builder exists for this resource.

## Key elements

- **`setupTestDb()`** — called at module scope; provisions and tears down the test database.
- **`MISSING_ID`** — a well-formed ObjectId that is guaranteed absent, so tests hit the 404 branch rather than the 422 (malformed-id) branch.
- **`CONTACT_PAYLOAD`** — canonical valid body used by every creation test (`name`, `email`, `subject`, `message`).
- **`createFeedbackRequest()`** — posts `CONTACT_PAYLOAD` to `/feedback/contact`, asserts 201, returns the new record's `id`. Used to seed admin-route tests.
- **`describe('POST /feedback/contact')`** — happy path (201 + spec), initial status is `new`, optional `name` omitted, 422 for bad email, 422 for missing `message`.
- **`describe('GET /feedback')`** — admin 200, empty-list 200, 401 unauthenticated, 403 non-admin, and 422 for out-of-range `pageSize`/`page` query params.
- **`describe('POST /feedback/search')`** — the body-based sibling of `GET /feedback`; asserts 200, filter-on-body works, same 422 pagination bounds, 403 non-admin.
- **`describe('PUT /feedback/{id}')`** — 200 on status+notes update, 422 for invalid status enum, 404 for missing id, 401 unauthenticated, 403 non-admin.

## Relationships

- **`tests/support/contract.ts`** — provides the `toSatisfyApiSpec()` matcher used in virtually every assertion to validate the response against the published OpenAPI/JSON-schema spec.
- **`tests/support/http.ts`** — provides `api()` (supertest-style client) and `authenticateAs(role)` (returns a `{ bearer }` token for the named role).
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, which resets the database between test runs so each `describe` starts clean.

## Notes

- There is **no fixture builder** for feedback records; the public `POST /feedback/contact` endpoint doubles as the test-seeding mechanism. If that endpoint's contract changes, admin-route tests silently break.
- `MISSING_ID` must remain a valid 24-hex ObjectId. Using an invalid string would exercise the 422 path and mask a missing 404 handler.
- The `POST /feedback/search` block exists because `GET /feedback` historically declared a JSON body for filters — a body no browser sends and one `setCache` cannot key on, causing two different searches to share a cached page. The tests pin the invariant that the body form and query form enforce identical pagination bounds.
- Pagination-bound tests use `it.each` with `pageSize=500` and `page=0` to catch silent clamping (e.g., capping to 100) that would diverge from the other three search endpoints.
