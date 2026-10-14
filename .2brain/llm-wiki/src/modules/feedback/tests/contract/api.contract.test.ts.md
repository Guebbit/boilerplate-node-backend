---
source: src/modules/feedback/tests/contract/api.contract.test.ts
sha256: d082ea427b4f0115ae5289e23f6d4660e9e0075a290d2dc3ae55031e47f1e62c
generated_at: 2026-10-14T15:51:46.411420+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/feedback` API, which is the only feedback resource with a publicly-writable endpoint (`POST /feedback/contact`, `security: []`) alongside admin-only read/write routes. The file verifies that public responses carry no admin fields, admin routes return 401/403 rather than leaking data, and that validation boundaries (field lengths, enum values, pagination limits) match the OpenAPI spec end-to-end. Records are created exclusively through the public endpoint since no fixture builder exists.

## Key elements

- **`CONTACT_PAYLOAD`** — Shared valid payload (name, email, subject, message) used as the base object across positive and mutation tests.
- **`createFeedbackRequest()`** — Helper that POSTs `CONTACT_PAYLOAD` to `/feedback/contact`, asserts a 201, and returns the new record's `id`. Used by admin-route tests to seed one row.
- **`describe('POST /feedback/contact')`** — Validates 201 on success, initial `new` status, optional `name` omission, 422 on malformed email / missing message / message > 5000 chars.
- **`describe('POST /feedback/contact — the contract bounds…')`** — Pins trim-then-validate behavior: email > 254 chars rejected, whitespace-only `subject`/`message` rejected with `errors[0].details`, and leading/trailing whitespace stripped from kept text.
- **`describe('GET /feedback')`** — Admin-authenticated list: 200 on success, empty array when no rows, 422 for out-of-range `pageSize`/`page`, 422 for a `status` value outside the enum.
- **`describe('POST /feedback/search')`** — Body-carrying sibling of `GET /feedback`; asserts the same pagination and enum bounds, plus that a body filter (e.g. `status: 'resolved'`) actually narrows results.
- **`describe('PUT /feedback/{id}')`** — Full-replacement semantics (RFC 9110 §9.3.4): omitted optional fields are cleared; required `status` enforced; invalid enum → 422; nonexistent id → 404.
- **`describe('PATCH /feedback/{id}')`** — Partial-update semantics: omitted fields preserved, explicit `null` clears `adminNotes`, empty string `''` for `adminNotes` rejected (not treated as null). *(section truncated in source)*

## Relationships

- **`tests/support/contract.ts`** (`@tests/contract`) — Imported for side effects; registers the contract-assertion helpers that the individual `expect` calls rely on (status-code and schema shape checks).
- **`tests/support/http.ts`** (`@tests/http`) — Provides `api()` (a preconfigured `supertest`-style client) and `authenticateAs(role)` which returns a `{ bearer }` token for admin-role requests.
- **`tests/support/ids.ts`** (`@tests/ids`) — Exports `MISSING_ID`, a known-absent identifier used to exercise 404 paths on `PUT`/`PATCH`.
- **`tests/support/setup-test-db.ts`** (`@tests/setup-test-db`) — `setupTestDb()` is called at module scope to create/seed a per-test database before any request runs.

## Notes

- There is **no fixture builder** for feedback records; every test that needs an existing row must call `createFeedbackRequest()` through the public endpoint first. This means test ordering within a `describe` block can matter if assertions depend on row count.
- `PUT` vs `PATCH` semantics are deliberately pinned in separate `describe` blocks: PUT clears omitted optionals, PATCH preserves them. This is the single most common source of confusion when adding new optional fields.
- Pagination validation (`pageSize ≤ 100`, `page ≥ 1`) is asserted on **both** the query-string form (`GET /feedback`) and the body form (`POST /feedback/search`) to guarantee the shared schema is enforced identically regardless of transport.
- The `maxLength: 5000` on `message` lives in `openapi.yaml`; the test here is the end-to-end pin for that limit, not a re-statement of a local validator.
- The file is `@module` (no named exports); all assertions are self-contained `it` blocks.
