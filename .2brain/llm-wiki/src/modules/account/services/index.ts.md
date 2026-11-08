---
source: src/modules/account/services/index.ts
sha256: 089b9a01f2df080ce213bfa83ec67f1ae9e1e228ca4266e88e1141e86726b474
generated_at: 2026-11-08T04:18:18.516587+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/index.ts

## Purpose

Barrel file that assembles the account module's service layer into two public objects — `accountService` and `twoFactorService` — plus a small set of named re-exports (token-type constants, OAuth error classes, a few pure helpers). It exists so that every controller and external caller reaches account logic through exactly one of those two objects, keeping 2FA callers decoupled from core-account callers at the type level.

## Key elements

- **`accountService`** — Object aggregating ~45 functions from ~26 sub-modules (signup, login, logout, refresh, password reset/change, profile, email verification/change, account deletion, sessions, OAuth, previous-email cleanup, export-row reaping, reauth, re-encryption, mail, public config). This is the primary entry point for all non-2FA account operations.
- **`twoFactorService`** — Separate object for 2FA enrollment, removal, backup codes, and the login-time challenge/verify pair. Deliberately isolated so importing `accountService` does not pull 2FA types into a caller's dependency graph.
- **Named re-exports** — `PASSWORD_RESET_TOKEN_TYPE`, `ACCOUNT_RESTORE_TOKEN_TYPE`, `EMAIL_VERIFY_TOKEN_TYPE`, `EMAIL_CHANGE_TOKEN_TYPE`, `EMAIL_CHANGE_UNDO_TOKEN_TYPE` (from `../token-types`); `termsVersion` (from `../consent-record`); `operatorIdentity`; `RESET_REQUEST_SECONDS`; `amrAfterReauth`; `VERIFY_RESEND_SECONDS`; six `OAuth*Error` classes (from `./oauth`).
- **Excluded from both objects** — `./export` and `./export-job` are intentionally not re-exported here; only the export controllers and `../module.ts` import them directly.

## Relationships

- **Controllers (all `src/modules/account/controllers/*`)** — Each listed controller (`get-account`, `get-session`, `get-sessions`, `get-2fa`, `get-oauth-callback`, `get-oauth-links`, `get-reauth-methods`, `get-refresh-token`, `delete-account`, `delete-email-change`, `delete-oauth-link`, `delete-session`, `post-2fa-backup-codes`) imports `accountService` and/or `twoFactorService` from this file to perform its single HTTP operation.
- **`src/modules/account/consent-record.ts`** — Source of the `termsVersion` value re-exported here; no other interaction.
- **`src/app/config-routes.ts`** — Top-level route registration; consumes the service objects indirectly through the controllers listed above.
- **`../session/`** (not a graph neighbor listed, but noted in the file's docblock) — Provides JWT signing, refresh-cookie, and shared expiry utilities that the sub-services import; no file outside this module imports `../session/` directly.

## Notes

- The split into two objects is a deliberate TypeScript coupling decision: a file that calls only `accountService.login` should not see 2FA types in its import graph. Adding a function to the "wrong" object is a breaking change for type-level consumers.
- The file is pure wiring — it contains no business logic, no `if`/`for`, no side effects at module level beyond the two object literals.
- Sub-service files (e.g. `./login`, `./signup`) are never imported by controllers directly; they are only reachable through the `accountService` / `twoFactorService` objects defined here.
- `exportRows.reapExpiredExports` is included in `accountService`, but the heavier export pipeline (`./export`, `./export-job`) is excluded — a distinction that can be confusing when searching for "export" logic.
