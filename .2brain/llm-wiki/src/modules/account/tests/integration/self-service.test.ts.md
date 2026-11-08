---
source: src/modules/account/tests/integration/self-service.test.ts
sha256: 895083bb89dab486834eba639c9ed726e9fef03ad8c184375805f0643742b783
generated_at: 2026-11-08T04:41:40.180819+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/self-service.test.ts

## Purpose

Integration tests for the self-service account surface (profile update, password change, session revocation, email verification) exercised at the service/repository layer. Tests are grouped by the invariant each defends: profile updates must not alter role/state/password; a wrong current password yields 422 (never 401); at most one email-verification link is valid (always the newest); email changes are staged as `pendingEmail` with strict collision and no-op semantics.

## Key elements

- **`describe('updateProfile')`** — covers field updates, avatar removal (`imageUrl: null` triggers `imageStore.remove`), 401-on-deleted-account, pending-email staging, case-insensitive no-op detection, and 409 collision checks (including another user's `pendingEmail`).
- **`describe('cancelPendingEmailChange')`** — clears `pendingEmail`, is idempotent when nothing is pending, revokes the live `EMAIL_CHANGE_TOKEN_TYPE` token, and emits `AUTH_EMAIL_CHANGE_CANCELED` audit only when a change was actually pending.
- **`jest.mock('@infrastructure/observability/audit', …)`** — full port replacement (not `jest.spyOn`) because CJS namespace getters are non-configurable and break under SWC + Stryker.
- **`jest.mock('@infrastructure/observability/analytics', …)`** — same replacement pattern; `emitAnalyticsEvent` becomes a plain `jest.fn()`.
- **`readTokens` (alias for `tokenRowsOf`)** — helper to fetch a user's stored one-time tokens as rows.
- **`sessionIdOfRow`** — extracts `familyId` from a possibly-undefined session lookup row.

## Relationships

- **`src/modules/account/services/index.ts`** — imports `accountService` (the SUT) plus token-type constants (`PASSWORD_RESET_TOKEN_TYPE`, `EMAIL_VERIFY_TOKEN_TYPE`, `EMAIL_CHANGE_TOKEN_TYPE`) and rate-limit seconds.
- **`src/modules/account/services/tokens.ts`** — imports `findLiveToken` / `spendLiveToken` for token lifecycle assertions.
- **`src/modules/account/tests/factories.ts`** — imports `ageTokenSend`, `plantSession`, `plantToken`, `sessionRowsOf`, `tokenRowsOf` to seed and inspect DB state directly.
- **`src/modules/users/tests/factories.ts`** — imports `createUser`, `userRepository`, and password constants (`PASSPHRASE_PASSWORD`, `REPLACEMENT_PASSWORD`).
- **`src/modules/users/repository.ts`** — exercised via `userRepository` for direct row assertions (e.g. `findByIdWithCredentials`, `deleteOne`).
- **`src/infrastructure/security/hash-token.ts`** — imports `hashToken` for verifying stored token hashes.
- **`src/infrastructure/observability/audit.ts`** — replaced via `jest.mock`; assertions go through `observePort(auditPort.emitAuditEvent)`.
- **`src/infrastructure/observability/analytics/index.ts`** — replaced via `jest.mock`; `emitAnalyticsEvent` is a plain mock.
- **`src/modules/account/audit.ts`** — imports `accountAuditActions` for action-name assertions.
- **`src/modules/account/analytics.ts`** — imports `accountAnalyticsEvents` for event-name assertions.
- **`src/infrastructure/adapters/image-store.ts`** — `imageStore.remove` is spied on to assert the old avatar file is deleted after a null-`imageUrl` save.
- **`src/infrastructure/adapters/logger.ts`** — imported (likely to silence or capture log output in the Stryker sandbox).
- **`src/kernel/access/tenant.ts`** — imports `DEPLOYMENT_TENANT_ID` for multi-tenant context setup.
- **`src/modules/access/index.ts`** — imports `accessService` (used in truncated session-revocation tests).

## Notes

- **Port replacement vs. `jest.spyOn`:** The audit and analytics ports are fully replaced with `jest.mock` factories because `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes. This is required for the SWC transform and Stryker's mutation sandbox to work correctly.
- **401-not-404 convention:** A verified token referencing a deleted account must return 401, not 404. The `openapi.yaml` spec declares no 404 on `PUT/PATCH /account`, and the `isAuth` guard treats this as unauthenticated everywhere else.
- **Email no-op semantics:** Restating the current address (any case) or the already-pending address must be a no-op that preserves the existing verification token hash — the mailed link must remain valid.
- **Avatar thumbnail:** The store derives the thumbnail path from the main `imageUrl`, so a single `imageStore.remove(url)` call is expected to cover both files.
- **`afterEach(() => jest.restoreAllMocks())`** runs globally; individual spies (e.g. `imageStore.remove`) are also explicitly restored in-test to avoid cross-test leakage.
