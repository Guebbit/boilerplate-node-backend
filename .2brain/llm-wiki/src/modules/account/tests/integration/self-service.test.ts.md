---
source: src/modules/account/tests/integration/self-service.test.ts
source_sha256: 2673c9441066148d240f166e7685c623ac426593493d97b8d4d235e3c0225d0c
context_sha256: 5d31e4b0a2b9f5e969ac0765250c56abc2d840ba7232a89fda929e92cf656a76
generated_at: 2026-11-22T04:00:24.208494+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/self-service.test.ts

## Purpose
Integration tests for the account module's self-service surface (profile update, email change/cancel, password change, session revocation, email verification) at the service/repository layer against a real test database. Tests are grouped by the invariant each defends, e.g. a profile update can't touch role/state/password, a wrong current password yields 422 (never 401, which would log out a valid session), and only the newest verification link works.

## Key elements
- `describe('updateProfile')`: covers updating owned fields (username, locale), leaving absent fields untouched, unsetting the avatar with `imageUrl: null` (clears `imageUrl`/`thumbnailUrl` and calls `imageStore.remove` with the main URL), and returning 401 rather than 404 for a deleted account.
- Email-change tests, using `accountService.requestEmailChange`:
  - The new address is held as `pendingEmail`, and `email` and `verifiedAt` are left unchanged.
  - Requesting the current address (including in a different case) returns 409 `EMAIL_ALREADY_CURRENT`. It neither drops the verification nor cancels an existing pending change.
  - Requesting the already-pending address returns 409 `EMAIL_CHANGE_ALREADY_PENDING`, and the previously mailed token stays unchanged.
  - An address that is another user's `email` or `pendingEmail` returns 409 (`EMAIL_ALREADY_USED` in the first case).
- `describe('cancelPendingEmailChange')`: clears `pendingEmail`, is a no-op when nothing is pending, and revokes the live email-change token. It also checks that `AUTH_EMAIL_CHANGE_CANCELED` is audited only when a change was actually pending.
- `readTokens` (alias of `tokenRowsOf`) and `sessionIdOfRow`: local helpers for reading stored one-time tokens and deriving a session's revocation id (`familyId`) from a possibly missing row.
- Module-level setup:
  - `jest.mock` replaces the audit port (via `auditPortMock()`) and the analytics port (`emitAnalyticsEvent` becomes `jest.fn()`).
  - `setupTestDb()` sets up the database.
  - `afterEach` calls `jest.restoreAllMocks()`.

## Relationships
- Drives `accountService` and the token type/timing constants (`PASSWORD_RESET_TOKEN_TYPE`, `EMAIL_VERIFY_TOKEN_TYPE`, `EMAIL_CHANGE_TOKEN_TYPE`, `RESET_REQUEST_SECONDS`, `VERIFY_RESEND_SECONDS`) from `src/modules/account/services`.
- Also imports `findLiveToken`/`spendLiveToken` from `src/modules/account/services/tokens.ts`, `confirmEmailChange`/`confirmEmailVerification` from `src/modules/account/services/verification.ts`, and `withTransaction` from `src/infrastructure/runtime/database.ts`.
- Checks side effects against `accountAuditActions` (`src/modules/account/audit.ts`) and `accountAnalyticsEvents` (`src/modules/account/analytics.ts`). It observes the mocked `src/infrastructure/observability/audit.ts` and `src/infrastructure/observability/analytics/index.ts` ports through `observePort`.
- Uses `../factories` (`plantSession`, `plantToken`, `ageTokenSend`, `sessionRowsOf`, `tokenRowsOf`) to seed and read sessions and tokens. It uses the users module's `createUser` and `userRepository` for fixtures and stored-state assertions.
- Imports `hashToken` from `src/infrastructure/security/hash-token.ts`.
- Imports `accessService` from `src/modules/access` and `DEPLOYMENT_TENANT_ID` from `src/kernel/access/tenant.ts`. Imports `logger` from `src/infrastructure/adapters/logger.ts`. None of these are used in the visible portion.
- Imports `imageStore` from `src/infrastructure/adapters/image-store.ts`; the visible tests spy on its `remove` method and mock it.

## Notes
- Ports are replaced with `jest.mock` factories rather than `jest.spyOn`. A CommonJS namespace import exposes a non-configurable getter that `spyOn` cannot redefine, which fails under `jest.config.mutation.js`'s swc transform and in Stryker's sandbox. See `tests/support/ports.ts`.
- A deleted account answers 401, not 404, because `openapi.yaml` declares no 404 on `PUT/PATCH /account`, and `isAuth` treats a verified token for a deleted account as 401.
- Several imported names (password-change helpers, session helpers, verification services) are used in parts of the file not visible here, so coverage for those areas is not described.
