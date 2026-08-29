# src/modules/feedback/tests/contract/api.contract.test.ts

## Purpose

Contract tests for every `/feedback` endpoint, verifying that actual HTTP responses satisfy the published API spec (via `toSatisfyApiSpec`). The suite specifically guards the security boundary where a public write endpoint (`POST /feedback/contact`, `security: []`) coexists with admin-only read/write routes, ensuring public responses never leak admin fields and admin routes return 401/403 rather than data.

## Key elements

- **`setupTestDb()`** — resets the database before the suite runs (called at module level).
- **`MISSING_ID`** — a hard-coded valid-format ObjectId guaranteed to not exist, used to exercise 404 branches without a real record.
- **`CONTACT_PAYLOAD`** — the canonical valid body for `POST /feedback/contact`; also the basis for negative payloads (dropped `name`, dropped `message`, bad `email`).
- **`createFeedbackRequest()`** — helper that posts `CONTACT_PAYLOAD` to the public endpoint and returns the new record's `id`; throws with the full response body if the status is not 201.
- **`describe('POST /feedback/contact')`** — 5 tests: valid submission, initial status is `new`, optional `name` omitted, malformed email → 422, missing `message` → 422.
- **`describe('GET /feedback')`** — 6 tests: admin 200, empty list, unauthenticated → 401, pagination out-of-range (`pageSize=500`, `page=0`) → 422, non-admin → 403.
- **`describe('POST /feedback/search')`** — 4 tests: admin 200, body-filter by `status` returns zero items, same pagination bounds as the GET form → 422, non-admin → 403.
- **`describe('PUT /feedback/{id}')`** — 5 tests: valid status+notes update → 200, out-of-enum status → 422, missing id → 404, unauthenticated → 401, non-admin → 403.

## Relationships

- **`tests/support/contract.ts`** — side-effect import (`import '@tests/contract'`) registers the `toSatisfyApiSpec` jest matcher and any global contract-test hooks used by every `expect(response).toSatisfyApiSpec()` call in this file.
- **`tests/support/http.ts`** — provides `api()` (a supertest-style client factory) and `authenticateAs(role)` (returns a `{ bearer }` token); every HTTP call and every auth-header setup in this file goes through these two helpers.
- **`tests/support/setup-test-db.ts`** — exports `setupTestDb()`, invoked once at the top of the module to guarantee a clean database state before any test creates records.

## Notes

- Records are created **through the public `POST /feedback/contact` route** rather than a factory, because no feedback factory exists and going through the route means the asserted payload is exactly what the application produces.
- The `POST /feedback/search` block exists because `GET /feedback` previously accepted filters in a JSON body (a pattern no browser sends and that `setCache` cannot key on, causing shared-cache collisions). The POST form is the corrected sibling; the pagination-bound tests in both blocks must stay in lockstep since they draw from the same shared validation schema.
- The pagination-rejection tests (`pageSize=500`, `page=0`) are deliberately duplicated across GET and POST to prevent one spelling from silently clamping while the other returns 422.
