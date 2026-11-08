---
source: src/modules/addresses/tests/contract/api.contract.test.ts
sha256: e1001310c937bbe67ddf3652db05b76dbd3b5905294642d7350fbab467beb121
generated_at: 2026-11-08T04:57:00.015014+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/contract/api.contract.test.ts

## Purpose

Contract test suite for the address-book HTTP API (`/account/addresses`). It exercises the full CRUD lifecycle, the "default address" action, validation rules, and ownership/error semantics over real HTTP against a seeded test database, asserting status codes, response shapes, and cross-request invariants (e.g. single-default guarantee).

## Key elements

- **`setupTestDb()`** – one-time DB reset invoked at module level before any test runs.
- **`describe('the address book: /account/addresses')`** – main suite:
  - Add → list → update → remove walkthrough verifying 201/200/204 codes, `Location` header, and the single-default invariant after deletion.
  - `PUT /account/addresses/{id}/default` as an idempotent action (repeating returns identical body).
  - 422 when `default` appears in a PATCH/PUT body (it is an action, not a field).
  - 404 for `PUT /default` on a non-owned id.
  - Validation: incomplete body → 422; `country` must be ISO 3166-1 alpha-2 (rejects `'Italy'`, `'it'`, `'ITA'`).
  - 404 for PATCH/DELETE on a non-owned id (same code as "not found").
  - PUT as full-replace (RFC 9110 §9.3.4): omitted `label` is cleared, not preserved.
  - PATCH `null` clears optional `label`; PATCH `""` for `label` → 422.
- **`describe('GET /account/addresses/{addressId}')`** – single-read suite:
  - 200 with expected body for own entry.
  - Uniform 404 for unknown id, malformed id, and another account's entry.
  - 401 without an auth session.

## Relationships

| Neighbor | Interaction |
|----------|-------------|
| `tests/support/contract.ts` | Imported as a side-effect (`import '@tests/contract'`); likely registers global contract-test expectations or interceptors. |
| `tests/support/http.ts` | Supplies `api()` (request builder) and `authenticateAs()` (bearer-token helper) used in every test. |
| `tests/support/ids.ts` | Provides the `MISSING_ID` constant used to simulate "id the caller does not hold" for 404 assertions. |
| `tests/support/setup-test-db.ts` | Provides `setupTestDb()` which resets/seeds the test database before the suite runs. |

## Notes

- The routes are mounted under `/account` but owned by the **addresses** module (`../../module.ts`); the test intentionally lives in the addresses tree, not the account tree.
- `default` is an **action** (`PUT …/default`), not a writable body field. Sending it in a PUT/PATCH body yields 422 — this is the central design decision the suite guards.
- 404 is the **uniform** response for "not found", "malformed id", and "belongs to another account"; the suite asserts no distinction to prevent information leaks.
- PUT semantics follow RFC 9110: the body is the **entire** new resource, so omitted optional fields are cleared (not left as-is).
- `country` validation is strict ISO 3166-1 alpha-2 (exactly two uppercase letters); the test uses `it.each` to cover common wrong formats.
