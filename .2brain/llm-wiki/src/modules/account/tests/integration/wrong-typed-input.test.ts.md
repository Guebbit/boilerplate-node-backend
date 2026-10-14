---
source: src/modules/account/tests/integration/wrong-typed-input.test.ts
sha256: c721a4ee4441cf4ff9f03a7958a291e1b88ce8f5ede02e18a2a0dd64cc3e7a30
generated_at: 2026-10-14T09:18:23.654778+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/wrong-typed-input.test.ts

## Purpose

Integration test ensuring that sending a wrong-typed `email` value (number, object, array, boolean, or `null`) to `PATCH /account` or `PUT /account` yields a **422** and never a **500**. The `isChangingEmail` guard executes before validation; this test locks in the invariant that the guard must tolerate any JSON value without throwing.

## Key elements

- **`describe` suite** — *"PATCH /account and PUT /account with a wrong-typed email"*: scopes all assertions to the two mutating account endpoints.
- **`it.each` block** — parametrised over four wrong types (`5`, `{ address: … }`, `[…]`, `true`); fires both a `PATCH` and a `PUT` request per type and asserts `422` on each.
- **`it` block (null email)** — sends `{ email: null }` via `PATCH` and asserts `422`, explicitly rejecting the interpretation of `null` as "no change."
- **`setupTestDb()`** — called once at module level to initialise the in-memory test database before any test runs.

## Relationships

- **`tests/support/http.ts`** — provides the `api()` request helper and `authenticateAs('user')` bearer-token factory used in every test case.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, which provisions a fresh database instance for the suite.

## Notes

- The module doc comment names the regression this guards against: a *thrown* exception in `isChangingEmail` (pre-validation) would surface as a 500 instead of the expected 422. If that guard changes, this file is the safety net.
- `null` is deliberately tested separately from the `it.each` cases because the route handler might special-case it as an "unset" field rather than a type error.
- Every request is authenticated; the test never exercises the unauthenticated path.
