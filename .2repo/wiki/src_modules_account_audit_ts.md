# src/modules/account/audit.ts

## Purpose

Defines the canonical set of audit-action strings the account module emits and registers them (type-only) into the shared `AuditActionMap` interface via a module augmentation of `@infrastructure/observability/audit`. It exists so every caller references one source of truth for action names while the infrastructure layer gains the union without a runtime import back into the module.

## Key elements

- **`accountAuditActions`** — a `const` object mapping symbolic keys (`AUTH_LOGIN`, `AUTH_TOKEN_REFRESHED`, …) to the wire-format strings (`'auth.login'`, `'auth.token.refreshed'`, …). 15 entries covering login, signup, profile, password reset/change, account delete, email verification, token refresh, logout, session revocation, and expired-token cleanup.
- **Module augmentation** (`declare module '@infrastructure/observability/audit'`) — adds an `account` key to `AuditActionMap` whose type is the union of all values in `accountAuditActions`. Purely compile-time; no runtime code is introduced.

## Relationships

- **Services** (`authentication.ts`, `profile.ts`, `token-cleanup.ts`, `verification.ts`) and **controllers** (`post-login.ts`, `post-reset-request.ts`) import `accountAuditActions` to tag audit log entries with the correct action string.
- **Tests** (`audit.test.ts`, `self-service.test.ts`, `service-flows.test.ts`, `token-cleanup-job.test.ts`) assert that the expected action strings appear in emitted audit records.
- **`@infrastructure/observability/audit`** (outside this folder) declares the base `AuditActionMap` interface that this file augments; the infrastructure layer never imports this file.

## Notes

- The `auth.` prefix on every wire string is **deliberate and load-bearing**: pre-existing log tooling and alert rules query on that prefix. Renaming to `account.*` would break downstream observability pipelines even though the folder is named `account`.
- The module augmentation is the only coupling to the infrastructure package and is type-only (erased at compile time). Adding a new action string here automatically widens the union seen by infrastructure without any import change on that side.
- All values are `as const`, so each property has a literal string type; the augmentation then collects them into a union. Do not widen individual values (e.g., to `string`) without checking the infrastructure side.
