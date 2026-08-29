# src/modules/account/audit.ts

## Purpose

Declares the vocabulary of audit-action strings emitted by the account domain and registers them (type-only) into the shared `AuditActionMap` so the observability layer recognizes them without a runtime import or a central enumeration file.

## Key elements

- **`accountAuditActions`** — `as const` object mapping semantic keys (`AUTH_LOGIN`, `AUTH_LOGGED_OUT`, …) to wire-format strings (e.g. `'auth.login'`, `'auth.logout_all'`). This is the single source of truth for the 15 audit strings the account domain emits.
- **`declare module '@infrastructure/observability/audit'`** — Type-only module augmentation that adds an `account` field to `AuditActionMap`, giving the union type to any consumer that imports the audit map. No runtime code is emitted.

## Relationships

- **`services/authentication.ts`**, **`services/profile.ts`**, **`services/token-cleanup.ts`**, **`services/verification.ts`** — Import `accountAuditActions` to tag the specific event they record (login, profile update, token expiry sweep, email verification, etc.).
- **`controllers/post-login.ts`**, **`controllers/post-reset-request.ts`** — Indirectly depend on the audit strings emitted by the services they call after a login or reset-request completes.
- **`tests/unit/audit.test.ts`** — Asserts the shape/values of `accountAuditActions` and the augmented type.
- **`tests/unit/token-cleanup-job.test.ts`**, **`tests/integration/self-service.test.ts`**, **`tests/integration/service-flows.test.ts`** — Exercise flows that produce audit entries and verify the correct action string is recorded.

## Notes

- The wire strings use the `auth.` prefix (not `account.`) because external log tooling and saved alert searches were built against that namespace before the module layout existed. Do **not** rename the values to match the folder name.
- Adding a new audit action requires only adding a key to `accountAuditActions`; the type augmentation picks it up automatically via `typeof accountAuditActions[keyof …]`. No shared file needs editing.
