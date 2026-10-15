---
source: src/modules/account/services/password-reset.ts
sha256: 797935ea45d847e698233eb03c78b9d66c68fad1a5ec9ff139acd357a0b4adff
generated_at: 2026-10-15T10:01:18.179100+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/password-reset.ts

## Purpose

Implements the **completion** half of a password reset (the `POST /account/reset-confirm` handler). Given the token from a mailed link, it validates the new password, checks it against breach lists, atomically spends the token, writes the new password, clears MFA state, records an audit row, and sends a confirmation email. The *request* (link generation and mailing) lives in `./password-reset-request`.

## Key elements

- **`completePasswordReset`** (exported) — Entry point. Order: shape/match validation → `findLiveToken` → `resetWith`. Catches DB errors into `rejectDatabaseEnvelope`.
- **`resetWith`** (internal) — Post-find pipeline: `assertPasswordNotBreached` → `spendLiveToken` (atomic delete) → `writePassword` → `afterReset`. The spend is deliberately last so a rejected password never burns the link.
- **`afterReset`** (internal) — Fire-and-forget follow-ups on success: `recordAccountAudit` (warn-logged on failure) and `sendAccountMail` (confirmation). Neither can flip a successful reset into an error.
- **`markResetCompleted`** (internal) — Callback passed to `writePassword`: resets `mfaFailures`/`mfaLockedUntil` and calls `markVerified`.
- **`resetLinkRefused`** (internal) — Builds the 422 `ResponseReject` for unknown, expired, or already-used tokens; all three are intentionally indistinguishable to the caller.

## Relationships

| Neighbor | Interaction |
|---|---|
| `services/tokens.ts` | `findLiveToken` (read), `spendLiveToken` (atomic delete), `refuseLink` (shared 422 shape) |
| `services/password.ts` | `validatePasswordChange` (shape/match), `writePassword` (persist new hash + run callback) |
| `services/verification.ts` | `markVerified` — promotes the account's email-verified flag |
| `services/mail.ts` | `sendAccountMail` — publishes the confirmation to the mail queue |
| `emails.ts` | `resetConfirmEmail`, `greetableName`, `recipientLocale` — compose the confirmation body |
| `services/caller.ts` | `recordAccountAudit` — writes the `AUTH_PASSWORD_RESET_COMPLETED` audit row |
| `audit.ts` | `accountAuditActions` — enum values for the audit action |
| `token-types.ts` | `PASSWORD_RESET_TOKEN_TYPE` — the discriminator passed to token find/spend |
| `infrastructure/security/breached-passwords` | `assertPasswordNotBreached` — HIBP-style check before the write |
| `infrastructure/http/response.ts` | `generateReject`, `ResponseSuccess`, `ResponseReject` |
| `infrastructure/http/errors.ts` | `rejectDatabaseEnvelope` — wraps unexpected DB errors |
| `infrastructure/adapters/logger.ts` | `logger.warn` — audit-row failure trail |
| `modules/users` (index / model) | `UserDocument` type for the account record |
| `services/index.ts` | Re-exports `completePasswordReset` for route handlers |

## Notes

- **Spending is last.** `findLiveToken` is a read; `spendLiveToken` is the atomic delete that resolves two simultaneous uses of one link. A breached or mismatched password exits *before* the spend, so the link survives and the user can retry.
- **Fire-and-forget post-actions.** Both the audit write and the confirmation mail use `void … .catch(…)` — a queue or lookup hiccup degrades to a missing audit row or a missed email, never a failed reset.
- **`oauthAccounts` is `select: false`.** The Mongoose schema hides it from default queries, but the TypeScript types still mark it as always-present. The code uses `user.oauthAccounts ?? []` with an eslint-disable to acknowledge the type/schema mismatch.
- **Locale resolution.** The confirmation mail uses `recipientLocale(user.locale, context)` — the *user's* stored locale is primary; the request's `Accept-Language` is only a fallback because the link is often clicked on a shared or borrowed device.
- **MFA reset is bundled.** `markResetCompleted` clears `mfaFailures` and `mfaLockedUntil` as part of the password write; the rationale is that possession of the recovery mailbox implies legitimate access.
