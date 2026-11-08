---
source: src/modules/account/services/password-reset-request.ts
sha256: dde70ec0cfcf7372dee593f1c77f1080fd46f66c2845b65f28c1f72ba5d826b6
generated_at: 2026-11-08T04:20:00.405972+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/password-reset-request.ts

## Purpose

Handles the *request* side of password resets: issuing a one-time reset token for an email address and queueing the reset-link email. It also issues the initial password-setup link for admin-created accounts that have no password yet. Spending (validating and acting on) the link lives in the sibling `./password-reset` module.

## Key elements

- **`RESET_REQUEST_SECONDS`** (exported const, `60`) — cooldown window between two reset mails for the same account.
- **`requestPasswordReset(email, context)`** (exported) — Public entry point for `POST /account/password/reset`. Looks up the user by email, issues the single live reset token, queues the email, records a metric and an audit row. Always resolves (never rejects); returns `true`/`false` indicating whether mail was queued.
- **`requestAccountSetup(user)`** (exported) — Issues the same reset-token type/TTL for an admin-created user and sends a setup-specific email. No `CallerContext`; no audit here (already recorded as `ADMIN_USER_CREATED` by the caller in `users/services/create.ts`).
- **`issueResetToken(user)`** (internal) — Atomic upsert of the account's single `PASSWORD_RESET_TOKEN_TYPE` token; replaces any prior one. Returns the plaintext token for the email link.
- **`resetRecentlySent(user)`** (internal) — Reads the live token's `sentAt` via `tokenSentAt` and compares against `RESET_REQUEST_SECONDS` using `cooldownRemaining`.
- **`mailResetLink(user, context)`** (internal) — Composes the locale-aware email (`resetRequestEmail`) and fire-and-forget queues it via `sendAccountMail`.
- **`passwordResetTokenTtlMs()`** (internal) — Reads `NODE_PASSWORD_RESET_TTL_MS` from `accountConfig`.

## Relationships

- **`services/tokens.ts`** — `issueToken` performs the atomic upsert; `tokenSentAt` retrieves the `sentAt` timestamp used for the cooldown check.
- **`services/mail.ts`** — `sendAccountMail` enqueues the composed email (fire-and-forget; never rejects).
- **`../emails.ts`** — Provides `resetRequestEmail`, `setupRequestEmail`, `greetableName`, and `recipientLocale` for composing locale-aware mail.
- **`../cooldown.ts`** — `cooldownRemaining` computes whether `sentAt` is still within `RESET_REQUEST_SECONDS`.
- **`../config.ts`** — `accountConfig()` supplies the TTL and other tunables.
- **`../token-types.ts`** — `PASSWORD_RESET_TOKEN_TYPE` constant identifies which token slot is used.
- **`../audit.ts`** — `accountAuditActions.AUTH_PASSWORD_RESET_REQUESTED` is the action recorded.
- **`@infrastructure/observability/audit.ts`** — `recordAudit` persists the audit row.
- **`../metrics.ts`** — `authPasswordResetTotal` Prometheus counter, incremented with `status: 'success' | 'failure'`.
- **`@infrastructure/adapters/logger.ts`** — `logger.error` is the only observability path when the lookup or mailing throws.
- **`@modules/users`** — `userService.findByEmail` resolves the account; `UserDocument` type is used throughout.
- **`services/index.ts`** — Re-exports this module's public API for consumers of the account services barrel.

## Notes

- **Anti-enumeration by design.** `requestPasswordReset` always resolves `false` (not an error) for unknown emails, DB failures, or cooldown skips. The HTTP layer returns a uniform `200`. The audit row is recorded unconditionally so the trail itself can't distinguish "no account" from "attempt blocked."
- **Single live token.** `issueToken` upserts one token per `(userId, tokenType)` pair. There is never a list of pending reset tokens for a user; a new request invalidates the previous link.
- **Cooldown anchor is the token's `sentAt`.** There is no separate rate-limit store; the check reads the token's own timestamp. If no token exists, `cooldownRemaining` is treated as `0` (not recently sent).
- **`void sendAccountMail(...)`** is intentionally fire-and-forget with an eslint disable. The mail queue logs its own failures; this file's `catch` block covers the *lookup/token* path only.
- **`requestAccountSetup` has no audit of its own.** The `ADMIN_USER_CREATED` row in `users/services/create.ts` is the only audit for that flow; do not double-record here.
- **The boolean return is not client-facing.** It exists for the metric increment and for unit-test assertions; controllers ignore it.
