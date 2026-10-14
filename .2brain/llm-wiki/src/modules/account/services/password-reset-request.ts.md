---
source: src/modules/account/services/password-reset-request.ts
sha256: 4cff5c6247d6cd67e4512378f085b638cf3a3fed9b87ee8787ffae50b1bc4ea2
generated_at: 2026-10-14T08:50:13.820757+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/password-reset-request.ts

## Purpose

Handles the *request* half of password reset: issuing a one-time reset token for a user's mailbox and queuing the email that carries the link. The *spending* of that link lives in `./password-reset`. A second, thinner path mints the same kind of token for admin-created accounts that ship without a password.

## Key elements

- **`RESET_REQUEST_SECONDS`** (exported, `60`) — cooldown window between two reset mails for the same account.
- **`requestPasswordReset(email, context)`** (exported) — Public entry point. Looks up the user, checks cooldown, issues a token, and queues the reset email. Always resolves `true`/`false`; never throws to the caller. Emits the `AUTH_PASSWORD_RESET_REQUESTED` audit row and the `authPasswordResetTotal` metric unconditionally.
- **`requestAccountSetup(user)`** (exported) — Issues a reset-type token and sends `setupRequestEmail` for an admin-created user. Only caller is the `USER_SETUP_REQUESTED` event in the `users` module; no audit or metric is recorded here.
- **`issueResetToken(user)`** (internal) — Calls `issueToken` with `PASSWORD_RESET_TOKEN_TYPE` and the configured TTL. The upsert replaces any prior live reset token atomically.
- **`resetRecentlySent(user)`** (internal) — Checks the live token's `sentAt` against `RESET_REQUEST_SECONDS` to decide whether to skip.
- **`mailResetLink(user, context)`** (internal) — Combines cooldown check, token issuance, email construction (locale from the user's own preference), and `sendAccountMail`.
- **`passwordResetTokenTtlMs()`** (internal) — Reads `NODE_PASSWORD_RESET_TTL_MS` from `accountConfig`.

## Relationships

- **`../config`** — reads `NODE_PASSWORD_RESET_TTL_MS` for token lifetime.
- **`../cooldown`** — uses `cooldownRemaining` to enforce the 60-second pacing window.
- **`../emails`** — pulls `resetRequestEmail`, `setupRequestEmail`, `greetableName`, and `recipientLocale` to build the mail body before the job is published.
- **`./mail`** — calls `sendAccountMail` to queue the email at high priority.
- **`./tokens`** — calls `issueToken` (atomic upsert) and `tokenSentAt` (cooldown anchor).
- **`../token-types`** — imports `PASSWORD_RESET_TOKEN_TYPE` so this file and `./password-reset` agree on the same token kind.
- **`../metrics`** — increments `authPasswordResetTotal` with a `success`/`failure` label.
- **`../audit`** — references `accountAuditActions.AUTH_PASSWORD_RESET_REQUESTED`.
- **`@infrastructure/observability/audit`** — calls `recordAudit` for the unconditional audit row.
- **`@infrastructure/adapters/logger`** — logs errors that are swallowed from the client's perspective.
- **`@modules/users`** — resolves `userService.findByEmail` and the `UserDocument` type.

## Notes

- **Silent cooldown is intentional.** A second request within 60 s returns the same `200`, sends no mail, and mints no new token. A `429` or any differential response would let an attacker enumerate registered addresses.
- **Audit fires unconditionally.** The `AUTH_PASSWORD_RESET_REQUESTED` row is written even when no account matched, so the audit trail itself cannot be used to distinguish "no such address" from "address exists."
- **The boolean return is test-facing only.** It never surfaces as a client-visible refusal; the HTTP response is always `200`.
- **Token value stays in this file.** Consistent with `./deletion-request.ts`, the plaintext token is used to build the mail and never passed further down the call stack.
- **`requestAccountSetup` reuses the reset token type and TTL.** The only difference is the email copy (`setupRequestEmail`). It has no `CallerContext`, so no audit or metric is recorded at this layer.
