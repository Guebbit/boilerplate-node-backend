---
source: src/modules/account/tests/integration/self-service.test.ts
sha256: 5d763f3e030be0e3f3977c63ed3786e23539802705012a1063edfc84508f20ee
generated_at: 2026-10-15T10:12:59.564759+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/self-service.test.ts

## Purpose

Integration tests for the self-service account surface (profile update, password change, session revocation, email verification) exercised at the service/repository layer against a real test database. The tests are grouped by the invariant each defends: profile updates cannot mutate role/state/password, a wrong current password yields 422 (never 401), and at most one verification link is valid (always the newest).

## Key elements

- **`jest.mock` blocks (audit, analytics, access)** — Replace the observability ports and `rolesOf` with `jest.requireActual` spreads + `jest.fn` overrides. The audit mock additionally re-wires `recordAudit` so it routes through the replaced `emitAuditEvent`. `rolesOf` calls through to the real implementation by default; only explicit `mockRejectedValueOnce` overrides change behavior.
- **`readTokens` / `sessionIdOfRow`** — Local helpers wrapping `tokenRowsOf` (from test factories) and extracting a session's `familyId` as a string.
- **`describe('updateProfile')`** — Covers: partial field update, avatar unset + `imageStore.remove` call, 401 (not 404) for a deleted account, pending-email workflow (new address → `pendingEmail`, email/`verifiedAt` untouched), case-insensitive email restatement as no-op, pending-survives-current-restatement, pending-survives-pending-restatement (token hash unchanged), 409 on email collision (both live-email and pendingEmail conflicts).
- **`describe('cancelPendingEmailChange')`** — Covers: clearing `pendingEmail`, no-op when nothing pending, revoking the live `EMAIL_CHANGE_TOKEN_TYPE` row, and emitting `AUTH_EMAIL_CHANGE_CANCELLED` audit only when a change was actually pending.
- **Token-type constants** — `PASSWORD_RESET_TOKEN_TYPE`, `EMAIL_VERIFY_TOKEN_TYPE`, `EMAIL_CHANGE_TOKEN_TYPE` and their resend windows (`RESET_REQUEST_SECONDS`, `VERIFY_RESEND_SECONDS`) imported from `@modules/account/services` to assert correct token rows.

## Relationships

- **`src/modules/account/services/index.ts`** — Source of every service function under test (`updateProfile`, `passwordChangeWithCurrent`, `sendVerificationEmail`, `completeEmailChange`, `accountService`) and the token-type / rate-limit constants.
- **`src/modules/account/services/profile.ts`**, **`password.ts`**, **`verification.ts`** — Concrete implementations the tests validate (imported via the barrel above).
- **`src/infrastructure/observability/audit.ts`** / **`analytics/index.ts`** — Mocked to isolate side-effects; `observePort` (from `@tests/ports`) asserts call arguments.
- **`src/modules/account/audit.ts`** / **`analytics.ts`** — Supply the action/event name constants (`accountAuditActions`, `accountAnalyticsEvents`) used in assertions.
- **`src/modules/access/index.ts`** — `rolesOf` is mocked (calls-through) so a specific test can simulate a rejected membership lookup.
- **`src/infrastructure/adapters/image-store.ts`** — `imageStore.remove` is spied to verify the avatar file is deleted after a null-`imageUrl` profile save.
- **`src/infrastructure/adapters/logger.ts`** — Imported (likely for suppression or assertion of log output in truncated sections).
- **`src/infrastructure/security/hash-token.ts`** — `hashToken` imported for verifying stored token hashes.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` used as the tenant context for calls.
- **`src/modules/account/tests/factories.ts`** — `ageTokenSend`, `plantSession`, `plantToken`, `sessionRowsOf`, `tokenRowsOf` helpers for seeding/inspecting DB state.

## Notes

- **Mock strategy is deliberate, not incidental.** `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import exposes; this breaks under the `swc` transform in `jest.config.mutation.js` and inside Stryker's mutation-testing sandbox. The `jest.mock` + `requireActual` spread pattern is the working substitute. See `tests/support/ports.ts` for the full rationale.
- **`recordAudit` is not directly mockable** because it closes over its own module's real `emitAuditEvent`. The mock therefore provides a custom `recordAudit` that calls the replaced `emitAuditEvent`, preserving spy visibility.
- **Email comparison is case-insensitive.** Restating the current or pending address in a different case must not clear `pendingEmail`, reset `verifiedAt`, or invalidate the already-mailed token.
- **401 vs 404 contract.** A deleted account hit via a still-verified token must return 401 (unauthenticated), not 404, per the OpenAPI spec and the `isAuth` middleware's global behavior.
- **`afterEach(jest.restoreAllMocks)`** ensures the calls-through `rolesOf` mock and any `imageStore.remove` spy are cleaned between tests.
