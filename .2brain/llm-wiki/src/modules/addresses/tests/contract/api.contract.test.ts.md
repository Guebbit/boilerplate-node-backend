---
source: src/modules/addresses/tests/contract/api.contract.test.ts
sha256: 088fe94a5753f541cf4f3a12c99608614ee0417621eb00b89826e0f6b800eee9
generated_at: 2026-11-14T19:19:49.981815+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the address-book REST API (`/account/addresses`), exercising every route over real HTTP against a test database. The suite lives in the `addresses` module (not `account`) because the routes are owned by the addresses module even though they are mounted under the `/account` prefix.

## Key elements

- **`describe('the address book: /account/addresses')`** — covers the full CRUD cycle, default-address pointer semantics, validation, ownership isolation, and method-specific contracts (PUT full-replacement vs. PATCH partial).
- **`describe('GET /account/addresses/{addressId}')`** — covers reading a single entry and the 404 surface (unknown id, malformed id, another account's id).
- **`setupTestDb()`** — called at module level to seed/prepare the test database before any test runs.
- **`HOME` / `OFFICE` constants** — reusable address fixtures (five identity fields + optional `label`).
- **`authenticateAs('user')` / `authenticateAs('admin')`** — produce a bearer token; two distinct identities are used to assert cross-account 404s.
- **`MISSING_ID`** — a well-known id that no caller owns, used to assert the uniform 404 contract.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Side-effect import (`import '@tests/contract'`); likely registers global contract-test helpers or matchers. |
| `tests/support/http.ts` | Provides `api()` (request builder) and `authenticateAs()` (token helper) used in every test. |
| `tests/support/ids.ts` | Exports `MISSING_ID`, a guaranteed-absent identifier for 404 assertions. |
| `tests/support/setup-test-db.ts` | Exports `setupTestDb()`, called once at the top of the file to prepare the test database. |

## Notes

- **`default` is a pointer, not a field.** It is set/moved only via `PUT /account/addresses/{id}/default`. Including `default` in a PATCH body returns **422**, not a silent ignore.
- **PUT is full replacement (RFC 9110 §9.3.4).** All five identity fields (`fullName`, `street`, `city`, `zip`, `country`) are required; omitting one is **422**. Omitted optional fields (e.g. `label`) are cleared, not preserved.
- **PATCH `label: null` clears; `label: ''` is rejected (422).** The two are deliberately not synonyms.
- **`country` must be an ISO 3166-1 alpha-2 code** (two uppercase letters). Full names, lowercase, and three-letter codes all return **422** via a `CountryCode` pattern.
- **Ownership is invisible.** Unknown id, malformed id, and another caller's id all yield the same **404** — never 403 — so a response does not confirm whether the id exists.
- **Idempotency of `PUT .../default`.** Repeating the call returns an identical body; the test asserts deep equality between the first and second response.
