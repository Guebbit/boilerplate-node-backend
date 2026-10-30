---
source: src/modules/account/services/password-reset-request.ts
sha256: dde70ec0cfcf7372dee593f1c77f1080fd46f66c2845b65f28c1f72ba5d826b6
generated_at: 2026-10-29T02:42:15.826243+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/password-reset-request.ts

## Purpose

Implements the *request* half of the password-reset flow: looking up an account by email, issuing (or replacing) its single live reset token, and queueing the token-bearing email. Also provides the analogous one-shot setup link for admin-created accounts that arrive without a password. The companion file `./password-reset.ts` handles *spending* the link; this file only mints and delivers it.

## Key elements

- **`RESET_REQUEST_SECONDS`** (60) — exported cooldown window; a second request within this window is silently skipped.
- **`resetRecentlySent(user)`** — internal; checks the live token's `sentAt` against the cooldown via `cooldownRemaining`.
- **`issueResetToken(user)`** — internal; calls `issueToken` to atomically upsert *the one* live reset token, replacing any previous one.
- **`mailResetLink(user, context)`** — internal; orchestrates cooldown check → token issuance → email construction (`resetRequestEmail`) → `sendAccountMail`. Returns `true` only when mail was actually queued.
- **`requestPasswordReset(email, context)`** — exported; the public entry point for `POST /account/password/reset`. Resolves to a boolean (`true` = mail sent) and *never* rejects. Records a metric and an audit row regardless of outcome.
- **`requestAccountSetup(user)`** — exported; called by the `users` module's `USER_SETUP_REQUESTED` event. Issues the same reset token type/TTL but sends `setupRequestEmail` instead. No `CallerContext`, no audit (already logged at creation).

## Relationships

- **`../config.ts`** — reads `NODE_PASSWORD_RESET_TTL_MS` to determine token lifetime.
- **`../cooldown.ts`** — delegates the "was a token sent within N seconds" check to `cooldownRemaining`.
- **`../emails.ts`** — builds both email payloads and resolves locale / greeting.
- **`./mail.ts`** — delivers the composed email via `sendAccountMail` (fire-and-forget; never rejects).
- **`./tokens.ts`** — `issueToken` (atomic upsert) and `tokenSentAt` (read `sentAt` for cooldown).
- **`../token-types.ts`** — supplies the `PASSWORD_RESET_TOKEN_TYPE` discriminator.
- **`@modules/users`** — `userService.findByEmail` for the account lookup; `UserDocument` type.
- **`../audit.ts`** — `accountAuditActions.AUTH_PASSWORD_RESET_REQUESTED` enum value.
- **`@infrastructure/observability/audit.ts`** — `recordAudit` writes the unconditional audit row.
- **`../metrics.ts`** — increments `authPasswordResetTotal` with `success`/`failure` label.
- **`@infrastructure/adapters/logger.ts`** — logs a server-side error if the async pipeline throws (invisible to the client).
- **`../services/index.ts`** — re-exports this module into the account service surface.
- **`../module.ts`** — wires the account module (registers routes / services that call into this file).
- **`@modules/users/services/`** — the sole caller of `requestAccountSetup` via the `USER_SETUP_REQUESTED` event.

## Notes

- **Anti-enumeration by design.** `requestPasswordReset` always resolves (never rejects) and always lets the HTTP layer answer `200`. The boolean return exists for the metric and tests; it is *not* a client-visible status code. The audit row is likewise unconditional so the DB trail can't distinguish "no such account" from "account exists."
- **Single live token.** `issueResetToken` performs an atomic upsert keyed on `(userId, tokenType)`. A second request does not accumulate tokens; it replaces the previous one. This bounds a spammer to one valid link per account.
- **Cooldown anchor.** The pace check reads the *token's own* `sentAt` rather than a separate timestamp column, so there is exactly one source of truth.
- **TTL direction.** The doc comment explicitly notes the safe tuning direction is *shorter*; the value lives in config so each deployment decides the trade-off.
- **`requestAccountSetup` has no context or audit.** It is invoked internally by the users module after `ADMIN_USER_CREATED` is already recorded; it must not double-audit.
- **Floating promises.** Both mail-send calls use `void` + an eslint disable because `sendAccountMail` is fire-and-forget (it enqueues to a job queue and logs its own failure). The caller intentionally does not await delivery.
