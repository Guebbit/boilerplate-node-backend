# src/modules/account/tests/unit/delete-account.test.ts

## Purpose

Unit tests for the two-step account-deletion controllers (`deleteAccountRequest` and `deleteAccountConfirm`) at the wiring level. The primary invariant pinned here is **enumeration prevention**: an unknown email must produce the same 200 as a known one, and a spent token must produce the same 422 as a never-live token, so neither response leaks which case occurred. All collaborators are fully mocked; mail-content assertions live in `emails.test.ts` and `self-service.test.ts`.

## Key elements

- **`describe('DELETE /account — deleteAccountRequest')`** — three cases:
  - 200 on existing user (asserts `findByEmail` → `requestAccountDeletion` → `successResponse` + metric `inc({status:'success'})`).
  - 200 on unknown email (asserts `requestAccountDeletion` never called, metric `inc({status:'failure'})`, `successResponse` still sent — the enumeration-prevention guard).
  - 500 when `findByEmail` rejects (asserts `rejectResponse(res, 500, [])`).
- **`describe('DELETE /account/delete-confirm — deleteAccountConfirm')`** — four cases:
  - 200 for a valid, unspent token (asserts `findLiveToken` → `spendLiveToken` → `removeOwnAccount` → `successResponse`).
  - 422 when `spendLiveToken` returns `false` (concurrent-spend race; `removeOwnAccount` never called).
  - 422 when `findLiveToken` returns `undefined` (expired or never-existed — deliberately one path, not two).
  - 500 when `findLiveToken` rejects.
- **Mocks** — `userService.findByEmail`, four `accountService` methods, `successResponse` / `rejectResponse`, `authAccountDeleteTotal.inc`, and `destroyRefreshCookie` / `destroyLoggedCookie`.

## Relationships

- **`controllers/delete-account-request.ts`** — imports and drives `deleteAccountRequest`; every assertion in the first `describe` block validates this controller's call sequence and response mapping.
- **`controllers/delete-account-confirm.ts`** — imports and drives `deleteAccountConfirm`; every assertion in the second `describe` block validates this controller's token-validation and deletion flow.
- **`services/index.ts`** — re-exported `accountService` is mocked; the test exercises the four wrappers (`findLiveToken`, `spendLiveToken`, `requestAccountDeletion`, `removeOwnAccount`) the controllers call into.
- **`users/index.ts`** — re-exported `userService.findByEmail` is mocked; the test only verifies the controller passes the email and branches on the resolved value.
- **`infrastructure/http/response.ts`** — `successResponse` / `rejectResponse` are mocked to let the test assert *which* status path the controller chose without depending on Express internals.
- **`metrics.ts`** — `authAccountDeleteTotal.inc` is mocked to assert the controller emits the correct `{ status: 'success' | 'failure' }` label on each branch.
- **`users/service.ts`** — the concrete implementation behind the mocked `userService`; not directly called in this test.

## Notes

- **Mail is intentionally out of scope.** `requestAccountDeletion` both mints the token *and* sends the link; the controller has nothing to publish. The goodbye mail is `removeOwnAccount`'s responsibility. Both are asserted in their respective service tests (`self-service.test.ts`, `emails.test.ts`).
- **Expired vs. never-existed tokens are one case.** `findLiveToken` collapses both to `undefined`, so the controller has a single 422 path. The "live" semantics are tested in `self-service.test.ts` against a real document, not here.
- **Cookie mock** (`@modules/account/session/cookies`) is required because the controller imports it directly (relative path); see the analogous note in `token-cleanup.test.ts` for why a module-level `jest.mock` is used instead of a relative import.
- **Metric label on the 422 path is not asserted** in the confirm tests — the test only checks `rejectResponse(422)` and that `removeOwnAccount` was skipped.
