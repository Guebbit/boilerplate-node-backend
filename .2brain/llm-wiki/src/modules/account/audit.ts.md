---
source: src/modules/account/audit.ts
sha256: 5a81567fecb6ffa708c857d751bbb7ad265535c5f2f1ee43789b9f5f557b70bc
generated_at: 2026-11-08T03:59:51.131015+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/audit.ts

## Purpose

Defines the canonical set of audit action strings that the account domain emits, and registers them into the infrastructure audit map via a type-only module augmentation. This keeps the log-action vocabulary colocated with the domain that owns it without creating an import cycle, and lets log tooling and alert rules reference a stable, typed union.

## Key elements

- **`accountAuditActions`** — A `const` object mapping event keys (e.g. `AUTH_LOGIN`, `AUTH_2FA_CHALLENGE_FAILED`) to the wire-format strings that appear in audit logs (e.g. `'auth.login'`, `'auth.two_factor.challenge_failed'`). Covers the full lifecycle: signup, login/logout, password change/reset, email verify/change, account deletion scheduling/cancellation/completion, token refresh & reuse detection, reauth, data export, 2FA enrollment/challenge/backup-codes, OAuth link/unlink/failure, and erasure reapplication.
- **`declare module '@infrastructure/observability/audit'`** — Augments the infrastructure `AuditActionMap` interface so the `account` key resolves to the union of all values in `accountAuditActions`. Type-only; no runtime import.

## Relationships

Every service file under `src/modules/account/services/` is a consumer of `accountAuditActions`. Each service emits the relevant action string(s) when logging an audit event:

- **signup.ts** → `AUTH_SIGNED_UP`, `AUTH_2FA_CODE_SENT`
- **password.ts**, **password-reset.ts**, **password-reset-request.ts** → `AUTH_PASSWORD_CHANGED`, `AUTH_PASSWORD_RESET_REQUESTED`, `AUTH_PASSWORD_RESET_COMPLETED`, `AUTH_ONE_TIME_TOKEN_REJECTED`
- **profile.ts** → `AUTH_PROFILE_UPDATED`
- **email-change.ts** → `AUTH_EMAIL_VERIFY_REQUESTED`, `AUTH_EMAIL_VERIFY_COMPLETED`, `AUTH_EMAIL_CHANGE_REQUESTED` / `_COMPLETED` / `_CANCELED` / `_UNDONE` / `_RESENT`
- **account-deletion.ts** → `AUTH_ACCOUNT_DELETE_SCHEDULED`, `AUTH_ACCOUNT_DELETE_CANCELED`
- **purge-deletions.ts** → `AUTH_ACCOUNT_DELETE_COMPLETED`
- **erasure-ledger.ts** → `AUTH_ERASURES_REAPPLIED`
- **tokens.ts**, **refresh.ts** → `AUTH_TOKEN_REFRESHED`, `AUTH_REFRESH_TOKEN_REUSE_DETECTED`, `AUTH_SESSION_REVOKED`
- **reauth.ts** → `AUTH_REAUTHENTICATED`, `AUTH_REAUTH_CODE_SENT`, `AUTH_ONE_TIME_TOKEN_REJECTED`
- **logout.ts** → `AUTH_LOGGED_OUT`, `AUTH_LOGGED_OUT_EVERYWHERE`
- **export.ts** → `AUTH_DATA_EXPORT_REQUESTED`, `AUTH_DATA_EXPORT_DOWNLOADED`
- **oauth.ts** → `AUTH_OAUTH_LINKED`, `AUTH_OAUTH_UNLINKED`, `AUTH_OAUTH_FAILED`

The direction is strictly one-way: services import `accountAuditActions`; nothing in this file imports a service.

## Notes

- **`auth.` prefix is intentional, not a typo.** The wire strings predate the current folder layout; log tooling and alert rules key off the `auth.` namespace, so the folder may be renamed freely but the strings must not change.
- **`AUTH_ONE_TIME_TOKEN_REJECTED` deliberately conflates "unknown" and "expired"** to avoid leaking which case occurred to an attacker observing the log.
- **`AUTH_REFRESH_TOKEN_REUSE_DETECTED`** fires *and* revokes the entire refresh-token set in the same operation (per the comment); treating it as a pure log event would miss the security action.
- **`AUTH_2FA_CODE_SENT`** is the only 2FA action an *unauthenticated* caller can trigger an outbound message with — it is the primary signal for mail-bombing detection.
- The augmentation uses `typeof accountAuditActions[keyof typeof accountAuditActions]` to produce the literal union, so adding a new key to the object automatically widens the type with no separate edit needed.
