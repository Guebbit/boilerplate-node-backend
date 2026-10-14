---
source: src/modules/account/tests/integration/self-service.test.ts
sha256: 2cdf01b484878c76a48a51db6767671eee88d09b281577d1e4528d224879f866
generated_at: 2026-10-14T14:40:54.081767+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/self-service.test.ts

## Purpose

Integration tests for the self-service account surface (profile update, password change, session revocation, email verification) at the service/repository layer. Each test group defends a specific invariant: profile updates cannot mutate role/state/password, a wrong current password yields 422 (not 401), and at most one verification link is valid (always the newest).

## Key elements

- **`readTokens`** — alias for `tokenRowsOf`; reads the stored one-time-token rows for an account.
- **`sessionIdOfRow`** — extracts a revocation session id from a lookup result (may be undefined).
- **`describe('updateProfile')`** — the largest block; covers field mutation, avatar unset + file deletion, invalid-email 422, deleted-account 401, privilege-escalation rejection, pending-email flow (new address, restatement no-op, case-insensitivity, collision 409, pending-vs-pending collision).
- **`describe('cancelPendingEmailChange')`** — verifies explicit clearing of a pending email change.
- **Mock blocks** (`jest.mock` for `@infrastructure/observability/audit`, `@infrastructure/observability/analytics`, `@modules/access`) — replace the ports rather than spy on them (see Notes).
- **`setupTestDb()` / `afterEach(jest.restoreAllMocks)`** — lifecycle setup for an in-memory DB and mock cleanup.

## Relationships

- **`src/modules/account/services/index.ts`** — imports `accountService`, `updateProfile`, `passwordChangeWithCurrent`, `sendVerificationEmail`, `completeEmailChange`, and the token-type / rate-limit constants under test.
- **`src/modules/account/tests/factories.ts`** — provides `ageTokenSend`, `plantSession`, `plantToken`, `sessionRowsOf`, `tokenRowsOf` used to seed and inspect stored rows.
- **`src/modules/account/audit.ts`** — imports `accountAuditActions` (audit action identifiers asserted on the replaced audit port).
- **`src/modules/account/analytics.ts`** — imports `accountAnalyticsEvents` (analytics event identifiers asserted on the replaced analytics port).
- **`src/modules/access/index.ts`** — imports `rolesOf` and the `accessPort` namespace; the mock wraps `rolesOf` in a `jest.fn` that calls through to the real implementation by default.
- **`src/kernel/access/tenant.ts`** — imports `DEPLOYMENT_TENANT_ID` for role-lookup assertions.
- **`src/infrastructure/adapters/image-store.ts`** — spied (`imageStore.remove`) to verify file deletion after avatar unset.
- **`src/infrastructure/adapters/logger.ts`** — imported (likely for log-assertion or suppression in later blocks).
- **`src/infrastructure/security/hash-token.ts`** — imports `hashToken` for token-hashing helpers in test setup.
- **`src/infrastructure/observability/audit.ts`** & **`src/infrastructure/observability/analytics/index.ts`** — both fully mocked; the test asserts on the replaced `emitAuditEvent` / `emitAnalyticsEvent` fns.

## Notes

- **Ports are replaced, not spied.** `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import exposes; this fails under the SWC transform used by `jest.config.mutation.js` and inside Stryker's sandbox. The `audit` mock additionally reroutes `recordAudit` through the replaced `emitAuditEvent` because `recordAudit` closes over its own module's real function.
- **401 vs 404 for deleted accounts.** A verified token for a deleted account returns 401 (unauthenticated), not 404. This matches `openapi.yaml` (no 404 declared on `PUT/PATCH /account`) and the `isAuth` middleware convention.
- **Strict schema rejection.** `zodProfileSchema` is strict: including `role`, `active`, or `password` in the body causes the entire request to be rejected with 422 rather than silently dropping those fields.
- **Case-insensitive email restatement.** Submitting the current or pending address in a different case is treated as a no-op; the already-mailed verification link remains valid.
- **Avatar deletion is a single call.** The image store derives the thumbnail path from the main URL, so one `remove` call covers both files.
