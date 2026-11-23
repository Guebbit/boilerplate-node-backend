---
source: src/modules/addresses/tests/contract/api.contract.test.ts
source_sha256: ef05e9827867bae39e9a81379ebf6b6b10f55265154eb127a0b38e7d46cb057b
context_sha256: b7a6497612e34f9ba69f4cb4fbcddac5f8fe5b65527745b5a9723f5dfd5bdada
generated_at: 2026-11-22T04:16:12.409714+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the address book exercised over real HTTP at `/account/addresses`. The routes are mounted under `/account` but owned by the addresses module (its `module.ts`), so their suite lives here rather than with the `account` module's tests.

## Key elements
- `setupTestDb()` call: prepares the test database for the suite.
- `describe('the address book: /account/addresses')`: the main suite, using a `HOME` fixture (label, fullName, street, city, zip, `country: 'IT'`). Cases cover:
  - Full lifecycle: POST (201, `location` header, first address becomes default), list, PATCH, DELETE (204). Exactly one default is kept throughout, and a surviving address is promoted after the default is deleted.
  - `PUT /account/addresses/{id}/default`: moves the default, is idempotent (a repeat returns the same body), and returns 404 for an id the caller doesn't hold.
  - PATCH rejects `default` in the body (422). The default is a book-level pointer, not a field of one address.
  - Validation errors (422): incomplete body, and a `country` that is a full name, lowercase code or 3-letter code (must be uppercase ISO 3166-1 alpha-2, via the contract's `CountryCode` pattern).
  - `PUT /account/addresses/{id}` replaces the whole entry. It requires the five identity fields (fullName, street, city, zip, country), and an omitted `label` ends up cleared. A missing field gives 422.
  - PATCH `label: null` clears the label and leaves other fields unchanged. PATCH `label: ''` gives 422.
  - 404 for PATCH and DELETE on a missing id.
- `describe('GET /account/addresses/{addressId}')`: uses an `OFFICE` fixture. Reads one own entry (200, first address is `default: true`). An unknown id, a malformed id and another account's entry all return the same 404.

## Relationships
- `@tests/contract` (`tests/support/contract.ts`): imported for its side effects only (`import '@tests/contract'`). Its exports aren't used directly in this file.
- `@tests/setup-test-db` (`tests/support/setup-test-db.ts`): provides `setupTestDb()`.
- `@tests/http` (`tests/support/http.ts`): provides `api()`, the HTTP client, and `authenticateAs(role)`, which returns a `bearer` token. The tests use the `'user'` and `'admin'` roles.
- `@tests/ids` (`tests/support/ids.ts`): provides `MISSING_ID`, a well-formed id that matches no entry, for the 404 cases.

## Notes
- Ownership failures are deliberately indistinguishable from "not found": missing, malformed and other-account ids all return 404 (including on DELETE), so the response never reveals that an id belongs to someone else.
- PUT follows RFC 9110 replace semantics, so omitted optional fields are cleared. PATCH uses `null` to clear an optional field.
