# src/modules/account/tests/integration/self-service.test.ts

## Purpose

Integration tests for the self-service account surface — profile update, password change, session revocation, token removal, and logout — at the service/repository layer. Each `describe` block is grouped around a specific invariant the surface must defend (e.g., a profile update cannot escalate privileges; a wrong current password yields 422, never 401). Tests run against a real test database with mocked observability ports.

## Key elements

- **`updateProfile` (describe block)** — Verifies field-level updates, 422 on invalid email, 401 (not 404) for a deleted account, privilege-escalation rejection (`admin`, `active`, `password` are stripped), email-change resets `verified`, and 409 on a taken email.
- **`passwordChangeWithCurrent` (describe block)** — Confirms successful rotation (new works, old is dead), 422 on wrong current password, and pre-validation of the new/confirm pair before any bcrypt comparison.
- **`sessionRemove` (describe block)** — Tests that `userRepository.sessionRemove` revokes exactly one refresh token by `_id`, does not touch other token kinds, and cannot cross user boundaries.
- **`sessionRevoke` (describe block)** — Asserts the audit port fires `AUTH_SESSION_REVOKED` only when a token actually matched; a fabricated id produces no audit event.
- **`tokenRemoveByValue` (describe block)** — Verifies removal by plaintext value removes one sibling and reports a no-op for unknown values.
- **`logoutCurrentSession` (describe block)** — (Truncated in source) Asserts revocation of the current refresh token and audit recording.
- **`readTokens` (helper)** — Re-fetches a user with credentials from `userRepository` and returns the stored token array.
- **`jest.mock` blocks** — Replace `emitAuditEvent` and `emitAnalyticsEvent` with `jest.fn()` to allow assertion via `observePort`.
- **`setupTestDb()`** — Bootstraps the in-memory test database before all tests.

## Relationships

- **`@modules/account/services`** — Under-test units: `accountService`, `updateProfile`, `passwordChangeWithCurrent`, `sendVerificationEmail`, `EMAIL_VERIFY_TOKEN_TYPE`.
- **`@modules/users`** — Provides `userRepository` (token CRUD, `findByIdWithCredentials`, `deleteOne`), `TokenType` enum, and `hashToken` used to build expected stored digests.
- **`@modules/users/tests/fixtures`** — `createUser` (seed factory) and `PLAIN_PASSWORD` (known credential for login assertions).
- **`@tests/setup-test-db`** — `setupTestDb` initialises the test database connection.
- **`@tests/caller-context`** — `testCallerContext` supplies a standard authenticated caller to every service call.
- **`@tests/response`** — `asSuccess` / `asReject` unwrap the service response envelope for assertions.
- **`@tests/ports`** — `observePort` retrieves the `jest.fn()` from a mocked port for `toHaveBeenCalledWith` / `not.toHaveBeenCalled` assertions.
- **`@infrastructure/observability/audit` & `analytics`** — Mocked at module level; their real implementations are spread in via `jest.requireActual`.
- **`../../audit` / `../../analytics`** — Import `accountAuditActions` and `accountAnalyticsEvents` enums for exact-action assertions.

## Notes

- **Port mocking strategy:** `jest.mock` (module-level replacement) is used instead of `jest.spyOn` because the CommonJS namespace getter is non-configurable; the latter fails under the `swc` transform in the mutation-testing config and inside Stryker's sandbox. See `tests/support/ports.ts` for the full rationale.
- **Token storage is hashed at rest:** `user.tokenAdd` calls `hashToken` before persisting, so assertions must compare against `hashToken('plain-value')`, never the raw string.
- **401 vs 404 for deleted accounts:** `openapi.yaml` declares no 404 on `PUT /account`; a valid token pointing at a deleted user is treated as unauthenticated (401) to stay consistent with the rest of the auth surface.
- **Wrong-password → 422, not 401:** Deliberate choice to prevent a typo from invalidating the caller's active session.
- **`afterEach` restores all mocks:** Because the port mocks are module-level `jest.fn()`s, `restoreAllMocks` resets their call counts between tests.
