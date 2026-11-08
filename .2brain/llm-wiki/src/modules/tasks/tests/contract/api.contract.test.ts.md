---
source: src/modules/tasks/tests/contract/api.contract.test.ts
sha256: 86bf4e227449b4d7b05c867a0917ed4d65a957265fa8b1e454de010911bdad4e
generated_at: 2026-11-08T08:37:56.916703+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tasks/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/tasks` resource. Tasks is the only resource with a genuinely public write endpoint (`POST /tasks`, `security: []`) alongside admin-only routes. This file guards that public responses carry no admin fields, that admin routes answer 401/403 rather than leaking data, and that validation/error shapes match the OpenAPI schema. Records are created exclusively through the public endpoint (no fixture builder exists) so assertions run against payloads the app actually produces.

## Key elements

- **`CONTACT_PAYLOAD`** — fixed submission body (name, email, subject, message) reused across tests.
- **`createContactTask()`** — POSTs to `/tasks` via the public endpoint, asserts 202, then reads the new record's `_id` from storage (the 202 has no body). Returns the id string.
- **`describe('POST /tasks')`** — valid submission (202, empty body, no Location header), initial `new` status, category/orderNumber round-trip, 422 for bad category/email/missing message, 5001-char message limit, optional `name` field.
- **`describe('POST /tasks — the contract bounds…')`** — controller-side trimming and validation: 254-char email ceiling, whitespace-only fields rejected as empty (with named `field` in `errors[0].details`), preserved text is trimmed.
- **`describe('GET /tasks')`** — admin 200, empty list, out-of-range pagination → 422 `application/problem+json`, category filter, invalid status enum → 422.
- **`describe('POST /tasks/search')`** — body-carried filters (status), same pagination bounds as the query form, same invalid-status 422.
- **`describe('GET /tasks/{id}')`** — admin 200 with id/subject, 404 for missing/malformed id, 403 for non-admin user, 401 for guest.
- **`describe('the status doors')`** — PATCH/PUT return 405 with `Allow: DELETE, GET, HEAD`; action endpoints (`/resolve`, `/mark-spam`, reopen) return the updated task.

## Relationships

- **`tests/support/contract.ts`** (`@tests/contract`) — side-effect import; registers the contract-matching infrastructure used by the `expect` assertions.
- **`tests/support/http.ts`** (`@tests/http`) — provides `api()` (supertest wrapper) and `authenticateAs()` for bearer-token setup.
- **`tests/support/setup-test-db.ts`** (`@tests/setup-test-db`) — `setupTestDb()` called at module top to create a clean test database before any test runs.
- **`tests/support/ids.ts`** (`@tests/ids`) — exports `MISSING_ID` used to exercise the 404 path on `GET /tasks/{id}`.
- **`src/modules/tasks/tests/factories.ts`** (`../factories`) — exports `findAllTasks()` to read stored records directly from the database (the 202 response body is empty, so the id must be fetched from storage).

## Notes

- `POST /tasks` returns **202 with an empty body** and no `Location` header; the created id is only recoverable by querying storage via `findAllTasks()`.
- The `@tests/contract` import has no named bindings — it is a pure side-effect import that wires up contract matchers.
- `maxLength` limits (message 5000, email 254) are defined in `openapi.yaml` and enforced through the generated schema; the tests pin them end-to-end.
- Whitespace-only text fields (`subject`, `message`, `orderNumber`, `name`) are trimmed to empty by the controller and then rejected as "empty" — the test asserts the error names the specific `field`.
- `PATCH` and `PUT` on `/tasks/{id}` are **not** status-update routes; they return 405. The allowed methods are `DELETE, GET, HEAD`. Status transitions happen through dedicated action sub-routes (`/resolve`, `/mark-spam`, reopen).
