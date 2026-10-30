---
source: src/modules/tickets/tests/contract/api.contract.test.ts
sha256: 8c7b561b3111b5b6328387b3d3d1a8f42d1fb7b6a39b839960a2dfb67193c04d
generated_at: 2026-10-29T06:06:25.362694+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the `/tickets` API surface. Validates that the public `POST /tickets` endpoint produces only visitor-visible fields, that admin list/detail routes enforce authentication and return correct shapes, and that status-transition sub-routes (`resolve`, `mark-spam`, `reopen`) behave as the OpenAPI contract specifies. Exists to catch drift between the live API and the generated schema without needing a UI or integration harness.

## Key elements

- **`setupTestDb()`** — called once at module load; resets the test database before any assertions run.
- **`CONTACT_PAYLOAD`** — shared fixture body (name, email, subject, message) used by nearly every test case.
- **`createContactTicket()`** — helper that `POST`s the public endpoint and returns the created ticket id; used to seed data for admin-route tests.
- **`describe('POST /tickets')`** — happy-path and validation-error contracts (201 shape, initial `new` status, category/orderNumber echo, 422 on bad enum/email/missing/over-length fields).
- **`describe('POST /tickets — the contract bounds…')`** — controller-specific behavior the generated schema alone cannot express: email ≤ 254 chars, whitespace-only fields rejected as empty, and trimming of kept text.
- **`describe('GET /tickets')`** — admin list contract: 200 shape, empty list, out-of-range pagination → 422 problem+json, category filter, invalid status → 422.
- **`describe('POST /tickets/search')`** — body-based sibling of the query-form search; asserts identical pagination and status-enum bounds so the two spellings cannot disagree.
- **`describe('GET /tickets/{id}')`** — single-ticket read: 200 shape, 404 for missing/malformed id, 403 for unprivileged user, 401 for guest.
- **`describe('the status doors')`** — PATCH/PUT return 405 with correct `Allow` header; POST sub-routes (`/resolve`, `/mark-spam`, `/reopen`) each return the updated ticket. *(File is truncated after the first few sub-route assertions.)*

## Relationships

- **`tests/support/contract.ts`** — imported as a side-effect (`import '@tests/contract'`); installs the schema-matching assertions and problem+json format checks that every `expect(...)` in this file relies on.
- **`tests/support/http.ts`** — provides `api()` (supertest-wrapped client) and `authenticateAs(role)` (returns a bearer token for a seeded role).
- **`tests/support/ids.ts`** — exports `MISSING_ID`, a UUID guaranteed not to exist, used for the 404 path test.
- **`tests/support/setup-test-db.ts`** — exports `setupTestDb()` which truncates/seeds the test database so each test file starts from a known-empty state.

## Notes

- No fixture builder exists for tickets; every record is created through the public `POST /tickets` endpoint so the payload under assertion is exactly what the app produces.
- The `maxLength: 5000` and email `maxLength: 254` checks are intentional end-to-end pins: the limits live in `openapi.yaml` and the generated Zod schema, so a regression in the controller's trim-then-validate pipeline would surface here.
- Pagination bound tests (`pageSize=500`, `page=0`) assert `application/problem+json` to lock the error format, not just the status code.
- The `POST /tickets/search` block is a deliberate cross-check: both spellings share the same schema, so the tests assert they reject the same illegal values identically.
