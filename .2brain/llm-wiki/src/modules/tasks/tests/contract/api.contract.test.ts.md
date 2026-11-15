---
source: src/modules/tasks/tests/contract/api.contract.test.ts
sha256: 1506b2505b915c79d58294e373f69821fadfeb828a10c2196da25ff964c9fcd8
generated_at: 2026-11-14T22:13:18.054188+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/contract/api.contract.test.ts

## Purpose

Contract tests for every `/tasks` route: the one genuinely public write endpoint (`POST /tasks`, `security: []`) and the admin-only read/search/status-action routes. Verifies that public responses carry no admin fields, that admin routes answer 401/403 rather than leaking data, and that validation bounds (pagination, enum values, field lengths, whitespace trimming) behave consistently whether expressed as query params or a JSON body.

## Key elements

- **`CONTACT_PAYLOAD`** – Canonical valid submission body (name, email, subject, message) used as the base payload throughout.
- **`createContactTask()`** – Posts `CONTACT_PAYLOAD` via `POST /tasks`, asserts 202, then reads the new record's `_id` from storage (202 has no response body).
- **`describe('POST /tasks')`** – Happy-path status, initial `new` status, category/orderNumber passthrough, optional-field omission, and 422 error contracts (bad email, missing message, >5000-char message).
- **`describe('POST /tasks — the contract bounds the form restates nothing of')`** – Server-side trimming, whitespace-only rejection for subject/message/orderNumber/name, email ceiling at 254 chars.
- **`describe('GET /tasks')`** – Admin list (200, empty list), out-of-range pagination → 422, category filter, invalid status enum → 422.
- **`describe('POST /tasks/search')`** – Body-carried filters (status, page/pageSize), same pagination and enum bounds as the query form.
- **`describe('GET /tasks/{id}')`** – Admin read, 404 for missing/malformed id, 403 for non-admin, 401 for unauthenticated.
- **`describe('the status doors')`** – PATCH/PUT → 405 (status is read-only), action sub-routes (`/resolve`, `/mark-spam`, `/reopen`) return the updated task.

## Relationships

- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module load to provide a clean database per run.
- **`tests/support/http.ts`** – `api()` returns the supertest agent for all HTTP calls; `authenticateAs(role)` yields a bearer token for admin/user/guest scenarios.
- **`tests/support/ids.ts`** – `MISSING_ID` supplies a guaranteed-absent ObjectId for 404 assertions.
- **`src/modules/tasks/tests/factories.ts`** – `findAllTasks()` reads all task documents from storage, used both to extract the new id and to assert server-side field values (status, category, trimmed subject).
- **`tests/support/contract.ts`** – Imported as a side-effect module (likely sets up shared contract-test helpers or schema-aware matchers) before any test runs.

## Notes

- **202 has no body.** The test helper `createContactTask` must read the id back from the database; do not attempt to parse a response body on the public create call.
- **Trimming is a controller concern, not OpenAPI.** Whitespace-only rejection and trimming tests exist because the controller trims before handing to the generated validator; the OpenAPI schema alone would accept `"   "` as a non-empty string.
- **Pagination bounds are shared.** The query-form (`GET /tasks?pageSize=500`) and body-form (`POST /tasks/search`) tests assert identical 422 responses, pinning a single source of truth in the generated schema.
- **`POST /tasks/search` exists solely because a browser cannot send a body on GET.** The tests explicitly call this out to prevent someone "simplifying" the route away.
- **`allow` header check.** The 405 test asserts `allow: 'DELETE, GET, HEAD, OPTIONS'` — a useful regression guard if a PATCH handler is ever accidentally registered.
