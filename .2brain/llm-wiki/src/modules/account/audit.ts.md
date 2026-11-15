---
source: src/modules/account/audit.ts
sha256: 5bc7988f3c1b7e3c1b6d5a4ae9090d2dac71af537897cff2f1475dfb20c86b5e
generated_at: 2026-11-14T18:29:47.407242+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/audit.ts

## Purpose

Declares the full set of audit action strings the account/auth domain emits and registers them into infrastructure's `AuditActionMap` via type-only declaration merging. This lets log tooling, alert rules, and downstream code reference the vocabulary by name while keeping the strings owned by the domain module rather than the infrastructure layer.

## Key elements

- **`accountAuditActions`** (exported `const` object) — The single source of truth for every audit action string in this domain (e.g. `'auth.login'`, `'auth.refresh_token.reuse_detected'`). Keys are descriptive (`AUTH_TOKEN_REFRESHED`); values are the wire-format identifiers queried by log/alert tooling.
- **`declare module '@infrastructure/observability/audit'`** — Augments the `AuditActionMap` interface so infrastructure's union type includes this module's values, without any runtime import in either direction.

## Relationships

All listed neighbors **consume** `accountAuditActions`; none are imported by this file.

- **src/modules/account/services/signup.ts** – fires `AUTH_SIGNED_UP`.
- **src/modules/account/services/profile.ts** – fires `AUTH_PROFILE_UPDATED`.
- **src/modules/account/services/password.ts** – fires `AUTH_PASSWORD_CHANGED`.
- **src/modules/account/services/password-reset-request.ts** – fires `AUTH_PASSWORD_RESET_REQUESTED`.
- **src/modules/account/services/password-reset.ts** – fires `AUTH_PASSWORD_RESET_COMPLETED`, `AUTH_ONE_TIME_TOKEN_REJECTED`.
- **src/modules/account/services/account-deletion.ts** – fires `AUTH_ACCOUNT_DELETE_SCHEDULED`, `AUTH_ACCOUNT_DELETE_CANCELED`.
- **src/modules/account/services/erasure-ledger.ts** – fires `AUTH_ERASURES_REAPPLIED`.
- **src/modules/account/services/purge-deletions.ts** – fires `AUTH_ACCOUNT_DELETE_COMPLETED`.
- **src/modules/account/services/email-change.ts** – fires `AUTH_EMAIL_CHANGE_*` (requested, completed, canceled, undone, resent), `AUTH_EMAIL_VERIFY_*`.
- **src/modules/account/services/tokens.ts / src/modules/account/services/refresh.ts** – fire `AUTH_TOKEN_REFRESHED`, `AUTH_REFRESH_TOKEN_REUSE_DETECTED`.
- **src/modules/account/services/reauth.ts** – fires `AUTH_REAUTHENTICATED`, `AUTH_REAUTH_CODE_SENT`, `AUTH_ONE_TIME_TOKEN_REJECTED`.
- **src/modules/account/services/logout.ts** – fires `AUTH_LOGGED_OUT`, `AUTH_LOGGED_OUT_EVERYWHERE`, `AUTH_SESSION_REVOKED`.
- **src/modules/account/services/oauth.ts** – fires `AUTH_OAUTH_LINKED`, `AUTH_OAUTH_UNLINKED`, `AUTH_OAUTH_FAILED`.
- **src/modules/account/services/export.ts** – fires `AUTH_DATA_EXPORT_REQUESTED`, `AUTH_DATA_EXPORT_DOWNLOADED`.

## Notes

- **`auth.` prefix, not `account.`** – Intentional. The strings are matched by log pipelines and alert rules written before the module was moved into the `account/` folder. Renaming the folder does not change the wire format.
- **`AUTH_ONE_TIME_TOKEN_REJECTED` is deliberately ambiguous** – Unknown, expired, and already-used one-time links all emit the same action so an attacker cannot enumerate valid tokens by timing/response differences. The `metadata.flow` field distinguishes which flow (reset, verify, email-change, restore) was involved.
- **`AUTH_2FA_CODE_SENT` is the unauthenticated outbound-signal** – It is the only 2FA action a caller without a valid session can trigger, making its failure-rate series the primary indicator of mail-bombing.
- **Metadata conventions vary by action** – `metadata.via` (deletion cancel), `metadata.method` (reauth, 2FA, export), `metadata.flow` (one-time token), `metadata.reused` (export). Check the inline JSDoc on each key for the exact contract.
