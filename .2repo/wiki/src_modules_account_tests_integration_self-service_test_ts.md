# src/modules/account/tests/integration/self-service.test.ts

## Purpose

Integration tests for the self-service account surface (profile update, password change, session revocation, email verification) at the service/repository layer. Each `describe` block defends one invariant: profile updates cannot mutate privileged fields, a wrong current password yields 422 (not 401), and token revocation is scoped to the exact token requested.

## Key elements

- **`updateProfile` block** — Verifies owned-field updates, 422 on invalid email, 404 on deleted account, privilege escalation rejection (admin/active/password), email-change unverification, and 409 on unique-index collision.
- **`passwordChangeWithCurrent` block** — Confirms successful rotation (new works, old dead), 422 on wrong current password, and validation of the confirm-password pair before bcrypt is invoked.
- **`sessionRemove` block** — Exercises `userRepository.sessionRemove` for single-token revocation, token-kind isolation, and cross-user isolation.
- **`sessionRevoke` block** — Asserts that `accountService.sessionRevoke` emits an audit event only when a token actually matched; a no-op revoke must not audit.
- **`tokenRemoveByValue` block** — Tests value-based removal leaves sibling tokens intact and reports `modifiedCount: 0` for unknown values.
- **`logoutCurrentSession` block** — Validates that the API-side logout emits both an audit event and an analytics event with the correct action/event constants.
- **`readTokens`** — Small helper that re-queries `userRepository.findByIdWithCredentials` to inspect stored tokens.
- **Port mocks** — `jest.mock` replaces `emitAuditEvent` and `emitAnalyticsEvent` with `jest.fn()`; calls are observed via `observePort`.

## Relationships

- **`@modules/account/services`** — The unit under test: `updateProfile`, `passwordChangeWithCurrent`, `accountService.sessionRevoke`, `accountService.logoutCurrentSession`, `accountService.login`, `sendVerificationEmail`, `EMAIL_VERIFY_TOKEN_TYPE`.
- **`@modules/users`** — `userRepository` (token ops, `findByIdWithCredentials`, `deleteOne`, `sessionRemove`, `tokenRemoveByValue`) and `TokenType` enum.
- **`@modules/users/tests/fixtures`** — `createUser` and `PLAIN_PASSWORD` seed test accounts.
- **`tests/support/caller-context`** — `testCallerContext` supplies the request context expected by service methods.
- **`tests/support/response`** — `asSuccess` / `asReject` unwrap the service response envelope for assertions.
- **`tests/support/setup-test-db`** — `setupTestDb()` configures the in-memory database before the suite runs.
- **`tests/support/ports`** — `observePort` wraps a mocked port function so tests can assert on calls without re-mocking.
- **`@infrastructure/observability/audit`** & **`@infrastructure/observability/analytics`** — Replaced (not spied) via `jest.mock`; the test asserts `emitAuditEvent` / `emitAnalyticsEvent` were called with the constants from `../../audit` and `../../analytics`.
- **`@modules/account/audit`** — `accountAuditActions` enum used in assertion payloads.
- **`@modules/account/analytics`** — `accountAnalyticsEvents` enum used in assertion payloads.

## Notes

- **Port replacement, not spying.** `jest.spyOn` cannot redefine the non-configurable getter exposed by a CommonJS namespace import; under the `swc` transform (and Stryker's sandbox) this throws. The file therefore uses `jest.mock` with `requireActual` spread. See `tests/support/ports.ts` for the full rationale.
- **Invariant framing.** The module doc-comment at the top lists the three invariants the suite defends; each `describe` maps to one. When adding tests, preserve that one-invariant-per-block structure.
- **`afterEach` restores all mocks** after each test, so port call counts never leak between cases.
- **`sendVerificationEmail` and `EMAIL_VERIFY_TOKEN_TYPE`** are imported but the visible (truncated) portion does not show a dedicated `describe` block for them; they are likely exercised in the truncated tail of the file.
