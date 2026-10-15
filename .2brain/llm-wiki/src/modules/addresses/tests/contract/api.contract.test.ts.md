---
source: src/modules/addresses/tests/contract/api.contract.test.ts
sha256: 96e80e8274f79bd2324872f2c9f574021cd09a5c835f3e2cac4456d83bc37b4f
generated_at: 2026-10-15T10:19:06.595141+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the address-book HTTP API at `/account/addresses`. Validates the full CRUD lifecycle, the book-level `default` pointer, PUT full-replace vs. PATCH partial-update semantics, validation rules, and ownership (404) behavior against a real HTTP server backed by a test database.

## Key elements

- **`describe('the address book: /account/addresses')`** — top-level suite; all cases run as authenticated user `'user'`.
- **"walks the whole book" case** — end-to-end: POST → POST (second default) → GET (asserts single default) → PATCH → DELETE (asserts survivor auto-promoted to default).
- **"moves the default with PUT …/default" case** — verifies the `PUT /account/addresses/:id/default` action is idempotent and returns the address itself (not a book).
- **"refuses `default` in a PUT or PATCH body"** — confirms `default` is not an address field; sending it yields 422.
- **"404s the default action for an entry the caller does not hold"** — foreign-ID `PUT …/default` → 404.
- **"matches the error contract for an invalid body"** — incomplete POST → 422.
- **Parameterized country-code cases** (`it.each`) — `Italy`, `it`, `ITA` all → 422; enforces ISO 3166-1 alpha-2.
- **"PUT replaces the whole entry"** — RFC 9110 §9.3.4 full-replace; omitted `label` is cleared (undefined), not preserved.
- **"PUT refuses a body missing a required identity field"** — missing `country` → 422.
- **"PATCH null clears the optional label"** — explicit `null` removes `label`; other fields untouched.
- **"PATCH refuses `""` for the optional label"** — empty string ≠ null → 422.
- **"answers the same 404 when REMOVING an entry the caller does not hold"** — DELETE on foreign ID → 404 (prevents leaking ownership via a distinct status).

## Relationships

- **`tests/support/contract.ts`** — side-effect import (`import '@tests/contract'`); likely registers global contract-test assertions or response-shape helpers.
- **`tests/support/http.ts`** — supplies `api()` (supertest-style request builder) and `authenticateAs()` (returns a bearer token).
- **`tests/support/ids.ts`** — supplies `MISSING_ID`, a sentinel ID guaranteed not to belong to the test user, used in every 404 case.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to create/reset the test database before the suite runs.

## Notes

- **Route ownership vs. mount path:** the routes live under `/account` in the URL tree but are owned by the addresses module (`../../module.ts`), which is why this suite is here rather than in account's test directory.
- **`default` is a book-level action, not a field:** the API deliberately separates it from address CRUD. Any body that includes `default` on PUT/PATCH is a contract violation (422).
- **PUT ≠ PATCH:** PUT is full-replace per RFC 9110 §9.3.4 — all five identity fields (`fullName`, `street`, `city`, `zip`, `country`) are required, and omitted optional fields are cleared. PATCH is partial-update; `null` is the only "clear" signal, `""` is rejected.
- **`setupTestDb()` runs once at import time** (module scope), not in `beforeEach`; the suite assumes a single fresh database for all cases.
- **404 for non-owned resources:** every method (PUT, PATCH, DELETE, and the `…/default` action) must return the same 404 rather than a distinguishable 403, so the API never confirms a foreign ID's existence.
