---
source: src/modules/account/tests/integration/reset-terms.test.ts
source_sha256: c8eccdcee94aa36dbf728b331952fcf00f190e9b2eb4e4c279e1fd7786e9fd15
context_sha256: 300296a56da4b3c8450a6fdc505da5d533dfe7534cf9566b115b3ec9fc004f01
generated_at: 2026-11-22T03:59:41.345257+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/reset-terms.test.ts

## Purpose
Integration tests for how the password-reset confirm path handles the Terms record. An account created by staff has no Terms record, so its holder's first password set is where the record is made. The file covers both the service (`accountService.completePasswordReset`) and the route (`POST /account/password/reset/confirm`).

## Key elements
- `fieldsOf(errors)`: maps a 422 error list to each error's `details.field`.
- `confirm(link, termsAccepted?)`: calls `accountService.completePasswordReset` with `REPLACEMENT_PASSWORD` as both password and confirmation, using `testCallerContext`.
- **Service, account with no record**:
  - Without the tick, it returns a 422 naming `termsAccepted`. The same link still works afterwards, and a retry with `true` returns 200.
  - With the tick, it stamps `termsAcceptedAt` (a `Date`) and `termsVersion`. The version comes from `NODE_TERMS_VERSION`, overridden to `'2026-11'` in the test.
  - A dead link gives only the "Invalid or expired token, please try again." error, never a `termsAccepted` one.
- **Service, account that already accepted**: the `termsAccepted` argument is ignored and the earlier `termsAcceptedAt` is left unchanged.
- **Route**:
  - Without `termsAccepted`, it returns 422 naming `termsAccepted`. With `termsAccepted: true`, it returns 204.
  - `termsAccepted: false` returns 422.

## Relationships
- `setupTestDb()` from `tests/support/setup-test-db.ts` is called at the top level to set up the test database.
- `accountService` from `src/modules/account/services/index.ts` is the unit under test for the service cases.
- `plantToken(userId, 'password', link)` from `src/modules/account/tests/factories.ts` seeds a reset token for a given link string.
- `createUser`, `REPLACEMENT_PASSWORD` and `userRepository` come from `src/modules/users/tests/factories.ts`. `userRepository` is the repository exposed by that factories file, which builds on `src/modules/users/repository.ts`. The tests use it to read back the stored user.
- `tests/support/callers.ts` provides `testCallerContext`.
- `tests/support/http.ts` provides `api()`, used for the route tests.
- `tests/support/response.ts` provides `asReject` and `asSuccess`, which narrow service results to failure or success.
- `tests/support/environment.ts` provides `withEnvironmentOverrides`, used to pin `NODE_TERMS_VERSION`.

## Notes
- The service returns `status` 200 on success, while the route answers 204.
- Every test uses a distinct email and token string, so cases don't collide.
