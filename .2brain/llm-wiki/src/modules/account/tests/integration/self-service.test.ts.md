---
source: src/modules/account/tests/integration/self-service.test.ts
sha256: 024ff0a4f727925d53a3a7fa337a2bfe5d8f47c0538edd96256cb25402bcf8e6
generated_at: 2026-10-29T03:00:06.152986+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/self-service.test.ts

## Purpose

Integration tests for the self-service account surface at the service/repository layer: profile update, password change, session revocation, and email verification. Each test group defends a specific invariant — a profile update cannot alter role/state/password, a wrong current password yields 422 (never 401, which would log out a valid session), and at most one verification link is active (always the newest).

## Key elements

- **`describe('updateProfile')`** — Verifies field-level updates (username, locale), avatar unset via `imageUrl: null` (deletes stored file through `imageStore.remove`), 401 for deleted accounts, email-change staging into `pendingEmail`, case-insensitive email no-ops, 409 on address collisions (both active and pending).
- **`describe('cancelPendingEmailChange')`** — Clears `pendingEmail`, revokes the live `EMAIL_CHANGE_TOKEN_TYPE` token, and emits `AUTH_EMAIL_CHANGE_CANCELLED` audit only when a change was actually pending.
- **`readTokens`** — Alias for `tokenRowsOf`; reads a user's stored one-time token rows.
- **`sessionIdOfRow`** — Extracts `familyId` as a string from an optional session row.
- **`jest.mock('@infrastructure/observability/audit', …)`** — Replaces the audit port with `auditPortMock()` (see Notes).
- **`jest.mock('@infrastructure/observability/analytics', …)`** — Spies on `emitAnalyticsEvent` while preserving other exports.
- **`setupTestDb()` / `afterEach(jest.restoreAllMocks)`** — Per-test database isolation and mock cleanup.

## Relationships

- **`@modules/account/services/index.ts`** — Primary system under test (`accountService`) plus token-type and timing constants (`PASSWORD_RESET_TOKEN_TYPE`, `EMAIL_VERIFY_TOKEN_TYPE`, `EMAIL_CHANGE_TOKEN_TYPE`, `RESET_REQUEST_SECONDS`, `VERIFY_RESEND_SECONDS`).
- **`@modules/account/services/tokens.ts`** — `findLiveToken` / `spendLiveToken` used to inspect or consume stored tokens in assertions.
- **`@modules/account/audit.ts` / `@modules/account/analytics.ts`** — Action/event name constants (`accountAuditActions`, `accountAnalyticsEvents`) referenced in expected calls.
- **`@modules/users/tests/factories.ts`** — `createUser`, `PASSPHRASE_PASSWORD`, `REPLACEMENT_PASSWORD`, and `userRepository` for seeding and direct row queries.
- **`../factories` (`@modules/account/tests/factories.ts`)** — `ageTokenSend`, `plantSession`, `plantToken`, `sessionRowsOf`, `tokenRowsOf` for token/session manipulation and reading.
- **`@modules/users/repository.ts`** — Reached indirectly via `userRepository` from the user factories; used for `findOne`, `deleteOne`, `findByIdWithCredentials`.
- **`@infrastructure/security/hash-token.ts`** — `hashToken` for verifying stored token hashes.
- **`@infrastructure/adapters/image-store.ts`** — `imageStore.remove` spied in avatar-unset tests.
- **`@infrastructure/observability/audit.ts` / `@infrastructure/observability/analytics/index.ts`** — Replaced wholesale (see Notes); `observePort` helper reads their mocked `emit` functions.
- **`@kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` for caller-context setup.
- **`@modules/access/index.ts`** — `accessService` imported (likely for role/permission assertions in password or session tests beyond the truncated portion).
- **`@infrastructure/adapters/logger.ts`** — `logger` imported, presumably silenced or asserted in error-path tests.

## Notes

- **Port replacement vs. spying:** The audit and analytics ports are replaced via `jest.mock` factory functions rather than `jest.spyOn`. Reason: `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import exposes, and this fails under the swc transform in `jest.config.mutation.js` and inside Stryker's sandbox. See `tests/support/ports.ts` for full rationale.
- **401 vs. 404 for deleted accounts:** Intentional. `openapi.yaml` declares no 404 on `PUT/PATCH /account`, and the `isAuth` guard treats a verified-token-for-deleted-user as unauthenticated (401) everywhere else.
- **Email-change semantics:** Setting `email` in `updateProfile` stages it in `pendingEmail` (never mutates `email` or `verifiedAt`). Restating the current or pending address (any case) is a no-op and does not invalidate the already-mailed verification link.
- **`imageStore.remove` is spied, not replaced** — it is an adapter instance method, not a port getter, so `jest.spyOn` works here.
