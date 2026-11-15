---
source: src/modules/account/tests/integration/self-service.test.ts
sha256: 8259fe4df47c3bd290bea559f7db59eeff0c3d096d7f2055b82759311712b18e
generated_at: 2026-11-14T19:09:27.181214+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/self-service.test.ts

## Purpose

Integration tests for the self-service account service surface (profile update, password change, session revocation, email verification/confirmation). Each test group defends a specific invariant: a profile update cannot mutate role/state/password, a wrong current password yields 422 (never 401), and at most one verification link is valid (always the newest). Tests run against a real test database via `setupTestDb`.

## Key elements

- **Module docblock** — declares the invariants this file defends and the grouping principle (one `describe` per invariant).
- **Port mocks (`jest.mock`)** — `@infrastructure/observability/audit` and `@infrastructure/observability/analytics` are *replaced* (not spied) because `jest.spyOn` cannot redefine the non-configurable getter on a CJS namespace import under the SWC transform / Stryker sandbox. See `tests/support/ports.ts` for full reasoning.
- **`readTokens`** — alias for `tokenRowsOf` from `../factories`; reads a user's stored one-time tokens.
- **`sessionIdOfRow`** — helper extracting `familyId` from a session row (may be undefined).
- **`describe('updateProfile')`** — covers field updates, avatar unset + `imageStore.remove` call, 401-on-deleted-account, email-change request semantics (pendingEmail, 409 codes for current/pending/taken addresses).
- **`describe('cancelPendingEmailChange')`** — covers clearing `pendingEmail`, no-op when nothing pending, revoking the live email-change token, and conditional `AUTH_EMAIL_CHANGE_CANCELED` audit emission.
- **`afterEach(() => jest.restoreAllMocks())`** — resets all spies (including `imageStore.remove`) after each test.

## Relationships

- **`src/modules/account/services/index.ts`** — primary SUT: `accountService`, token-type constants (`PASSWORD_RESET_TOKEN_TYPE`, `EMAIL_VERIFY_TOKEN_TYPE`, `EMAIL_CHANGE_TOKEN_TYPE`), and timing constants (`RESET_REQUEST_SECONDS`, `VERIFY_RESEND_SECONDS`).
- **`src/modules/account/services/tokens.ts`** — imports `findLiveToken`, `spendLiveToken` (used in token-spending tests beyond the truncated portion).
- **`src/modules/account/services/verification.ts`** — imports `confirmEmailChange`, `confirmEmailVerification` (confirmation-flow tests).
- **`src/infrastructure/runtime/database.ts`** — imports `withTransaction` (transactional assertions).
- **`src/infrastructure/security/hash-token.ts`** — imports `hashToken` (validating stored token hashes).
- **`src/infrastructure/observability/audit.ts`** — mocked; assertions check `emitAuditEvent` calls with actions from `accountAuditActions`.
- **`src/infrastructure/observability/analytics/index.ts`** — mocked; `emitAnalyticsEvent` replaced with a mock function.
- **`src/modules/account/audit.ts`** — imports `accountAuditActions` for audit assertions.
- **`src/modules/account/analytics.ts`** — imports `accountAnalyticsEvents` for analytics assertions.
- **`src/modules/account/tests/factories.ts`** — `ageTokenSend`, `plantSession`, `plantToken`, `sessionRowsOf`, `tokenRowsOf` for seeding and reading DB state.
- **`src/modules/access/index.ts`** — imports `accessService` (permission-boundary checks).
- **`src/kernel/access/tenant.ts`** — imports `DEPLOYMENT_TENANT_ID` for tenant-scoped test contexts.
- **`src/infrastructure/adapters/image-store.ts`** — spied on to assert avatar file deletion after profile update.
- **`src/infrastructure/adapters/logger.ts`** — imported for log-related assertions.

## Notes

- **Audit/analytics mocking is replacement, not spying.** The file header comment and inline `jest.mock` blocks explain why: `jest.spyOn` fails on non-configurable CJS namespace getters under the project's SWC config and Stryker sandbox. Use `observePort` from `@tests/ports` to read call counts from the mock.
- **401 vs 404 on deleted accounts.** The test explicitly asserts 401 (not 404) when a verified token references a deleted user, matching `openapi.yaml` and the `isAuth` middleware convention.
- **Email-change 409 codes are distinct** (`EMAIL_ALREADY_CURRENT`, `EMAIL_CHANGE_ALREADY_PENDING`, `EMAIL_ALREADY_USED`) and the tests verify that a rejected request does *not* cancel an already-pending change or invalidate an already-mailed token.
- **Avatar removal is a single `imageStore.remove` call** on the main URL; the store derives the thumbnail path internally, so tests assert one call covering both files.
- The file content shown here is truncated; the full file additionally covers password-change (422-on-wrong-password), session revocation, and email-verification confirmation tests referenced in the module docblock.
