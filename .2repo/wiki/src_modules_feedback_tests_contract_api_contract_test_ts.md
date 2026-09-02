# src/modules/feedback/tests/contract/api.contract.test.ts

## Purpose

Contract test suite for the `/feedback` API — the only resource with a genuinely public write endpoint (`POST /feedback/contact`, `security: []`) alongside admin-only routes. Guards that public responses carry no admin fields, that admin routes return 401/403 rather than leaking data, and that every endpoint's response shape satisfies the published API spec. Records are created through the public endpoint itself (no fixture builder exists) so the payload under assertion is what the app actually produces.

## Key elements

- **`MISSING_ID`** — A syntactically valid ObjectId guaranteed to not exist in the DB; exercises the 404 branch rather than a 422 validation failure.
- **`CONTACT_PAYLOAD`** — The canonical valid submission body (name, email, subject, message) reused across tests.
- **`createFeedbackRequest()`** — Helper that POSTs to `/feedback/contact` and returns the created record's `id`; throws with the full response body on non-201.
- **`describe('POST /feedback/contact')`** — Valid submission (201), initial `new` status, optional `name` omission, malformed email (422), missing message (422).
- **`describe('GET /feedback')`** — Admin list: populated and empty states, plus out-of-range pagination (`pageSize=500`, `page=0`) must 422 like every other search endpoint.
- **`describe('POST /feedback/search')`** — The DTO/body form of the same search. Verifies filtering by body field works, and that pagination bounds match the query-string form exactly (shared schema).
- **`describe('PUT /feedback/{id}')`** — Admin update: valid status+notes (200), out-of-enum status (422), non-existent id (404).
- **`describe('POST /feedback/contact — honeypot')`** — Submits a `website` field; asserts the bot receives the same 201 as a real user, the field is absent from the response, and the record is stored with status `"spam"`.
- **`describe('DELETE /feedback/{id}')`** — Admin delete: success (200 + list empty), non-existent id (404), malformed non-ObjectId string (404, not 500).

## Relationships

- **`tests/support/contract.ts`** (`@tests/contract`) — Registers the `toSatisfyApiSpec()` matcher used by every assertion in this file to validate responses against the published OpenAPI spec.
- **`tests/support/http.ts`** (`@tests/http`) — Provides `api()` (supertest-based client factory) and `authenticateAs(role)` (bearer-token retrieval for admin calls).
- **`tests/support/setup-test-db.ts`** (`@tests/setup-test-db`) — Called once at module level via `setupTestDb()` to prepare a clean in-memory database before any test runs.

## Notes

- **No fixture builder.** Feedback records must be created through `POST /feedback/contact`; there is no `createFeedback` helper in the test support layer. All admin-route tests that need a record call `createFeedbackRequest()` first.
- **Honeypot is silent.** The bot-facing response is byte-identical to a legitimate 201; the only trace is the stored `"spam"` status. Tests assert both the public shape *and* the admin-visible status to catch regressions in either direction.
- **Pagination parity is enforced by design.** The `GET /feedback` query-string form and the `POST /feedback/search` body form share one validation schema; the parallel `it.each` blocks exist to catch a split where one form clamps while the other rejects.
- **`POST /feedback/search` exists for cache-keying.** The route comment explains that `GET /feedback` once read filters from a JSON body — something browsers won't send and `setCache` cannot key on, causing two different searches to share a cached page. The POST form is the corrected vehicle for body-carried filters.
- **`MISSING_ID` vs. malformed IDs.** A well-formed-but-absent ObjectId hits the 404 branch; a string like `"not-an-object-id"` also hits 404 (the DELETE tests assert this explicitly to prevent a 500 from a failed `ObjectId` cast).
