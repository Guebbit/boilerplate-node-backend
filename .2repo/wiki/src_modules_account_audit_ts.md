# src/modules/account/audit.ts

## Purpose

Central registry of audit-action strings emitted by the account module. It defines the vocabulary once and augments the infrastructure audit-action map at the type level so that the union of all valid actions grows with the modules that own them, without any module needing to edit a shared file.

## Key elements

- **`accountAuditActions`** (`as const`) – The single source of truth for every audit string the account module fires (logins, signups, password resets, token refresh/reuse, 2FA events, data export, session revocation, token-cleanup jobs, etc.). Each key is a human-readable event name; each value is the wire-format string (e.g. `'auth.login'`).
- **Module augmentation of `@infrastructure/observability/audit`** – A `declare module` block that adds a `account` key to `AuditActionMap`, typed as the literal union of all values in `accountAuditActions`. Type-only; no runtime import is created back into infrastructure.

## Relationships

- **`services/authentication.ts`, `services/verification.ts`, `services/two-factor.ts`, `services/export.ts`, `services/profile.ts`, `services/token-cleanup.ts`** – All import `accountAuditActions` to pass a recognized action string when emitting audit events (login, signup, password reset, 2FA enrollment/challenge-failure, data export, token cleanup, etc.).
- **`controllers/post-reset-request.ts`** – Emits `AUTH_PASSWORD_RESET_REQUESTED` (and downstream completion) via the service layer that reads from this registry.
- **`session/login-observability.ts`** – Consumes `AUTH_LOGIN`, `AUTH_REAUTHENTICATED`, `AUTH_LOGGED_OUT*` actions for session-scoped observability signals.
- **`tests/unit/audit.test.ts`** – Unit-tests the shape/values of `accountAuditActions` and the augmented type.
- **`tests/integration/self-service.test.ts`**, **`tests/integration/service-flows.test.ts`** – Integration tests that assert the correct action string is emitted during full service flows.
- **`tests/unit/token-cleanup-job.test.ts`** – Verifies `AUTH_TOKEN_EXPIRED_CLEANUP` is fired by the cleanup job.
- **`tests/cross-cutting/audit-actions-registered.test.ts`** – Cross-cutting guard that every action string appearing in the codebase is present in the augmented `AuditActionMap`.

## Notes

- The `auth.` prefix (not `account.`) is **intentional and load-bearing**: existing log tooling and alert rules were written against these strings before the current module layout. Renaming the folder does not change the wire format.
- The `declare module` augmentation is purely type-level; at runtime the only export is the `accountAuditActions` const. Do not expect a runtime side-effect from importing the module solely for types.
- Several entries carry security-significance JSDoc (e.g. `AUTH_REFRESH_TOKEN_REUSE_DETECTED`, `AUTH_2FA_CHALLENGE_FAILED`). The comment explains *why* the action exists, not just *when* it fires—preserve that context if you refactor surrounding code.
