---
source: src/modules/account/tests/integration/resend-budget.test.ts
source_sha256: 0fb36aad18f8b1b45625b858ba4ed5e7dccfccbe55a46db881d3adb7914150be
context_sha256: 05669ef78efabcc4a8bc11cfd0df59daf00e4d28740ab3d615dea2fd3b484f01
generated_at: 2026-11-22T03:59:26.027988+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/resend-budget.test.ts

## Purpose
Integration test asserting that a refused email-verification resend (cooldown, HTTP 429) does not spend the "signed-in credential budget". That budget is meant to be consumed only by wrong passwords on `/reauth` and `/password`, since a resend takes no secret. It runs against the real app and reads the budget from the `RateLimit` response header.

## Key elements
- `signedInRemaining(response)` — parses the `RateLimit` header with the regex `"credentials-signed-in";r=(\d+)` and returns the remaining count as a number. Throws an `Error` if the header has no signed-in budget.
- `describe('a refused resend and the signed-in credential budget')` with one test, `leaves the budget /reauth spends untouched`:
  1. Creates an `unverified` user and logs in via `POST /account/login` to get a bearer token.
  2. Sends a wrong-password `POST /account/reauth` and records the remaining budget (`before`).
  3. Calls `POST /account/email-verification/resend` twice: the first returns 200, the second 429.
  4. Asserts the refused response's `ratelimit` header does not contain `credentials-signed-in`.
  5. Sends another wrong `/reauth` and expects `remaining` to equal `before - 1`, so only that reauth spent budget.

## Relationships
- `src/modules/users/tests/factories.ts` — supplies `createUser` (used with the `'unverified'` state) and `PLAIN_PASSWORD` for logging in.
- `tests/support/http.ts` — supplies `api()`, the request helper used for all HTTP calls (imported as `@tests/http`).
- `tests/support/setup-test-db.ts` — `setupTestDb()` is called at module top level to prepare the test database (imported as `@tests/setup-test-db`).

## Notes
- The test depends on the second resend being refused by the cooldown, so it relies on the first resend having just succeeded.
- The `/password` endpoint is mentioned in the header comment as another budget spender, but only `/reauth` is exercised here.
