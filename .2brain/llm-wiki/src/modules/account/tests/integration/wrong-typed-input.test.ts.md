---
source: src/modules/account/tests/integration/wrong-typed-input.test.ts
sha256: c721a4ee4441cf4ff9f03a7958a291e1b88ce8f5ede02e18a2a0dd64cc3e7a30
generated_at: 2026-11-08T04:45:07.740246+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/wrong-typed-input.test.ts

## Purpose

Integration test guarding against a 500 (server crash) when a caller sends a wrong-typed value (number, object, array, boolean, or `null`) in the `email` field of `PATCH /account` or `PUT /account`. The critical constraint it protects: the `isChangingEmail` guard executes **before** schema validation, so it must tolerate (not throw on) values the validator would reject, and the route must respond with 422.

## Key elements

- **`describe('PATCH /account and PUT /account with a wrong-typed email')`** – suite containing two tests.
- **`it.each([...])('answers 422 for %s, not 500')`** – parameterized over four wrong-typed values (`5`, `{ address: 'a@example.com' }`, `['a@example.com']`, `true`); asserts both `PATCH` and `PUT` return status **422**.
- **`it('answers 422 for a null email too')`** – sends `{ email: null }` via `PATCH`; asserts 422. Documents that `null` is treated as a present-but-invalid value, not as "field absent / no change."
- **`setupTestDb()`** – called at module scope to seed a clean test database before any test runs.

## Relationships

- **`tests/support/http.ts`** – imports `api` (supertest-style HTTP client) and `authenticateAs` (obtains a bearer token for a named user).
- **`tests/support/setup-test-db.ts`** – imports `setupTestDb` to provision/reset the test database.

## Notes

- The module docstring makes the intent explicit: this test exists because `isChangingEmail` runs **before** validation. If the guard assumed a string and received a number/object/array/boolean, it would throw → 500. The test pins the contract to 422.
- `null` is tested separately because a reader might conflate it with "the field was omitted." The test codifies that it is **not** "no change."
- Only the `user` account is exercised; no edge cases around admin/locked accounts are covered here.
