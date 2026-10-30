---
source: src/modules/addresses/tests/contract/api.contract.test.ts
sha256: e1001310c937bbe67ddf3652db05b76dbd3b5905294642d7350fbab467beb121
generated_at: 2026-10-29T03:10:06.760272+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the address-book REST API (`/account/addresses`) exercised over real HTTP against a seeded test database. The suite pins the behavioural contract of every CRUD endpoint plus the dedicated "set default" action, ensuring correct status codes, response shapes, RFC 9110 PUT/PATCH semantics, validation rules, and uniform 404 ownership responses.

## Key elements

- **`setupTestDb()`** — called at module top level; provisions and resets the test database before any test runs.
- **`describe('the address book: /account/addresses')`** — the main suite. Covers:
  - Full CRUD walk (POST → 201, GET list, PATCH, DELETE → 204) and default-promotion on deletion.
  - `PUT /account/addresses/{id}/default` — idempotent, returns the address body; repeating yields identical response.
  - 422 when `default` appears in a PUT/PATCH body (it is not a writable field).
  - 404 for non-owned or unknown ids across PUT/PATCH/DELETE.
  - 422 validation: missing required identity fields, `country` not ISO 3166-1 alpha-2 (parameterised over `'Italy'`, `'it'`, `'ITA'`).
  - PUT as full replacement (RFC 9110 §9.3.4): all five identity fields required; omitted optional `label` is cleared to `undefined`.
  - PATCH `null` clears optional `label`; PATCH `""` for `label` is rejected (422).
- **`describe('GET /account/addresses/{addressId}')`** — single-entry read:
  - 200 for the caller's own entry.
  - 404 uniformly for unknown id, malformed id, and another account's entry.
  - 401 when no session is supplied.
- **`HOME` / `OFFICE`** — local fixture objects with valid address fields used as request bodies.

## Relationships

| Neighbour | Interaction |
|---|---|
| `tests/support/contract.ts` | Side-effect import (`import '@tests/contract'`) — likely registers global contract-test helpers or assertions. |
| `tests/support/http.ts` | Supplies `api()` (supertest-style HTTP client) and `authenticateAs(userId)` → `{ bearer }` token for every request. |
| `tests/support/ids.ts` | Supplies `MISSING_ID`, a sentinel id guaranteed to be unowned, used in 404 assertions. |
| `tests/support/setup-test-db.ts` | Supplies `setupTestDb()`, invoked once at the top of the file to prepare the test schema/data. |

## Notes

- The file lives under the **addresses** module's test tree even though the routes are mounted at `/account/…`; the module doc-block explains this is by design (routes are owned by `addresses`, not `account`).
- `default` is **not** a body field — it is managed exclusively through the `PUT …/default` action. Sending it in a POST body is allowed (first address auto-defaults), but in PUT/PATCH it triggers 422.
- All "not found" and "not yours" cases return the **same 404**; the test for DELETE on a missing id explicitly documents that distinguishable responses would leak id existence.
- `country` validation is strict ISO 3166-1 **alpha-2 uppercase**; the parameterised test asserts all three common wrong forms fail identically.
- PUT semantics follow RFC 9110: a field omitted from the PUT body is **cleared** (not preserved), as asserted by the `label: undefined` check.
