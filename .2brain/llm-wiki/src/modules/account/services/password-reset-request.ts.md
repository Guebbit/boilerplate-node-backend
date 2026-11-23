---
source: src/modules/account/services/password-reset-request.ts
source_sha256: 27d15f2827a79e20465ddc2184c1cfc537abc4bf3950897ea54cb9ec23c0ce2a
context_sha256: 7a16b597662846fc284e06e60b18fcddb53b4cca3f605c88f7258247944ac61f
generated_at: 2026-11-22T03:39:09.906862+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/password-reset-request.ts

## Purpose
Handles requests for a password-set link: the public "forgot password" request, and the setup link sent to admin-created accounts that have no password. It issues a single live reset token and queues the email. Spending the link is handled elsewhere (`./password-reset`).

## Key elements
- `RESET_REQUEST_SECONDS` (60): minimum gap between two reset mails for one account.
- `requestPasswordReset(email, context)`: public entry point. Looks up the account by email and mails a reset link if one exists and the cooldown allows. Never rejects. Resolves `true` only if a mail was queued, and `false` for an unknown address, a skipped request, or a failed lookup. It always increments `authPasswordResetTotal` (`success`/`failure`). It always records an `AUTH_PASSWORD_RESET_REQUESTED` audit entry as an anonymous actor.
- `requestAccountSetup(user)`: issues a token and sends the setup email (`setupRequestEmail`) for an admin-created user. It has no `CallerContext` and does no auditing, because `ADMIN_USER_CREATED` is already recorded in `src/modules/users/services/create.ts`. Its only caller is the `users` `USER_SETUP_REQUESTED` event.
- Internal helpers:
  - `resetRecentlySent`: reads the live reset token's `sentAt` through `tokenSentAt` and checks it against the cooldown.
  - `issueResetToken`: calls `issueToken` with `PASSWORD_RESET_TOKEN_TYPE` and `NODE_PASSWORD_RESET_TTL_MS`.
  - `mailResetLink`: applies the cooldown, issues the token, builds the localized `resetRequestEmail`, and sends it.

## Relationships
- **Users:** the account lookup goes through `accountUserService` from `src/modules/users/friends/account.ts`. `UserDocument` is the type imported from `src/modules/users/index.ts`.
- **Tokens:** `./tokens` provides `issueToken` and `tokenSentAt`. `../token-types` provides `PASSWORD_RESET_TOKEN_TYPE`.
- **Config and cooldown:** `../config` (`accountConfig().NODE_PASSWORD_RESET_TTL_MS`) and `../cooldown` (`cooldownRemaining`).
- **Mail:** `../emails` builds the message and picks the locale. `./mail` (`sendAccountMail`) queues it with `{ urgent: true }`.
- **Observability:** `@infrastructure/observability/audit` (`recordAudit`) with `../audit` (`accountAuditActions`), `../metrics` (`authPasswordResetTotal`), and `@infrastructure/adapters/logger` for failure logging.

## Notes
- **Uniform response:** the endpoint always answers 200. Unknown addresses, cooldown skips, and lookup errors are all silent, so the response can't be used to enumerate accounts. The audit entry and the metric fire in every case for the same reason.
- **Cooldown skip:** it is silent (not a 429), and no new token is minted, so the previously mailed link stays the live one.
- **Single live token:** `issueResetToken` replaces the previous token atomically. This prevents stacking working links and races between simultaneous requests. Other token types are untouched.
- **Fire-and-forget mail:** `sendAccountMail` is called with `void`. It never rejects, because `enqueueEmail` logs its own failures.
- **Errors:** lookup failures are logged by `requestPasswordReset` and returned as `false`.
- **Setup flow:** `requestAccountSetup` does not apply the cooldown. It reuses the reset token type and TTL, and only the mail copy differs.
- **Metric and return value:** the metric is counted here because the controller doesn't await the outcome. The boolean return value is for tests and is never shown to clients.
