---
source: src/modules/account/tests/integration/self-service.test.ts
sha256: aa3289199827da04496b6d2dc1e56c493c2527d4a232d792f8d6499170e43f57
generated_at: 2026-09-27T14:35:21.167679+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/self-service.test.ts

## Purpose

Integration tests for the self-service account surface — profile update, password change, session revocation, and email verification — exercised at the service/repository layer. Each test group defends a specific invariant (e.g. profile update cannot touch role/state/password; a wrong current password yields 422, never 401; at most one verification link is valid, always the newest).

## Key elements

- **Port mocks (audit, analytics, access)** — `jest.mock` factory replacements for `emitAuditEvent`, `recordAudit`, `emitAnalyticsEvent`, and `rolesOf`. Replaced rather than spied because CommonJS namespace-import getters are non-configurable (breaks `jest.spyOn` under swc/Stryker). `recordAudit` is manually rerouted to call through to the mocked `emitAuditEvent`.
- **`readTokens(userId)`** — helper that fetches a user's stored tokens via `userRepository.findByIdWithCredentials`.
- **`describe('updateProfile', …)`** — covers: owned-field updates, invalid-email 422, deleted-account 401 (not 404), role/active/password escalation rejection, pending-email staging vs. immediate change, case-insensitive no-op restatement, 409 collision on both `email` and `pendingEmail` of other users.
- **`describe('cancelPendingEmailChange', …)`** — covers: explicit cancel, no-op when nothing pending, revocation of the live `EMAIL_CHANGE_TOKEN_TYPE` token, and conditional `AUTH_EMAIL_CHANGE_CANCELLED` audit emission.
- **Additional service imports** — `passwordChangeWithCurrent`, `sendVerificationEmail`, `completeEmailChange`, `VERIFY_RESEND_SECONDS`, `EMAIL_VERIFY_TOKEN_TYPE`, `EMAIL_CHANGE_TOKEN_TYPE` (file is truncated after the cancel block).

## Relationships

- **`src/modules/account/services/index.ts`** — primary SUT; all service functions under test are imported from here.
- **`src/modules/users/tests/factories.ts`** — provides `createUser`, password fixtures (`LEGACY_PASSWORD`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`), and the `userRepository` handle used for assertions and deletion.
- **`src/modules/users/index.ts`** — exports `TokenType` and `hashToken` used in token assertions.
- **`src/modules/users/repository.ts`** — underlying data access exercised through the factories' repository handle.
- **`src/modules/access/index.ts`** — `rolesOf` is mocked (call-through by default) to verify that profile update cannot alter membership; `DEPLOYMENT_TENANT_ID` from **`src/kernel/access/tenant.ts`** is passed as the tenant scope.
- **`src/modules/account/audit.ts`** — `accountAuditActions` enum values are the expected audit `action` strings in assertions.
- **`src/modules/account/analytics.ts`** — `accountAnalyticsEvents` values used in analytics assertions.
- **`src/infrastructure/observability/audit.ts`** / **`src/infrastructure/observability/analytics/index.ts`** — the actual port modules, replaced wholesale by the `jest.mock` factories.
- **`src/infrastructure/adapters/logger.ts`** — imported (likely for log-output assertions or suppression in specific cases).

## Notes

- **Why `jest.mock` factory instead of `jest.spyOn`**: the non-configurable getter on CJS namespace imports makes `spyOn` fail under the `swc` transform used by `jest.config.mutation.js` and inside Stryker's sandbox. The full rationale lives in `tests/support/ports.ts`.
- **`recordAudit` indirection**: the real `recordAudit` closes over its own module's `emitAuditEvent`; the mock factory re-implements it to call the *mocked* `emitAuditEvent`, so a spy on `emitAuditEvent` sees both direct and `recordAudit`-originated events.
- **401 ≠ 404 for deleted accounts**: `openapi.yaml` declares no 404 on `PUT/PATCH /account`; a verified token referencing a deleted user is treated as unauthenticated (401) consistently with `isAuth` elsewhere.
- **Strict schema rejection**: `zodProfileSchema` is `.strict()` — sending `role`/`active`/`password` in the body causes the *entire* request to be rejected (422) rather than silently dropping those fields.
- **Case-insensitive email restatement (B5)**: `SAME@Example.com` vs `same@example.com` is a no-op that preserves `verifiedAt` and does not create a `pendingEmail`.
- **`rolesOf` mock is call-through**: every test that needs a real membership lookup gets it; only the one escalation test overrides with `mockRejectedValueOnce`.
