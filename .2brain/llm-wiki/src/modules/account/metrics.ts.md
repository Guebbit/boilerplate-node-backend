---
source: src/modules/account/metrics.ts
generated_at: 2026-11-22T03:30:40.096513+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/metrics.ts

## Purpose
Declares the Prometheus counters owned by the account/auth domain and registers each on the shared `metricsRegistry`, so a single `/metrics` scrape includes them alongside the HTTP metrics. Nothing imports these counters to read them; `GET /observability/metrics/overview` resolves them by metric name from the registry. The `status` label lets each counter serve as both a volume and a success-ratio signal.

## Key elements
All exports are `prom-client` `Counter`s with `registers: [metricsRegistry]` and label names declared `as const`, so `inc({...})` is type-checked.

- **Login and signup:** `authLoginTotal`, `authSignupTotal`.
- **Password flows:**
  - `authPasswordResetTotal` counts the reset *request* only.
  - `authPasswordResetConfirmTotal` counts the token-spending confirmation.
  - `authPasswordChangeTotal` counts authenticated, current-password changes.
- **Session and re-auth:**
  - `authRefreshTotal` counts refresh-token operations.
  - `authReauthTotal` counts step-up re-authentication.
  - `authRefreshReuseTotal` (`auth_refresh_token_reuse_detected_total`) has no labels. It counts a rotated refresh token presented outside the grace window; each increment also revoked the account's whole refresh set.
- **Email:**
  - `authEmailVerifyTotal` counts verification confirmations, not sends.
  - `authEmailChangeConfirmTotal` counts email-change confirmations.
  - `authEmailChangeUndoTotal` counts undo attempts from the old address's link.
- **Account lifecycle:**
  - `authAccountDeleteTotal` has statuses `scheduled`, `canceled`, `purged` and `failure`.
  - `accountExportFailedTotal` counts failed data-export builds. It has no labels.
- **Two-factor** (`method` + `status` labels unless noted):
  - `authTwoFactorEnrollTotal`
  - `authTwoFactorCodeSentTotal`
  - `authTwoFactorDisableTotal`
  - `authTwoFactorChallengeTotal` (`status` only)
  - `authTwoFactorBackupCodesRegenerateTotal` (`status` only)
- **OAuth:** `authOauthTotal` (labels `provider`, `status`).
- **One-time tokens:** `authOneTimeTokenRejectedTotal` (label `flow`) counts tokens refused as unknown, expired or used.

## Relationships
- **`src/infrastructure/observability/metrics-registry.ts`** supplies `metricsRegistry`, the registry every counter here is registered on.
- **Account controllers** increment these counters. The neighbor list includes:
  - `get-oauth-callback.ts`: OAuth.
  - `get-refresh-token.ts`: refresh.
  - `post-login-2fa.ts` and `post-login-2fa-send.ts`: 2FA challenge and code sent.
  - `post-2fa-confirm.ts`: enrollment.
  - `post-2fa-disable.ts`: disable.
  - `post-2fa-backup-codes.ts`: backup-code regeneration.
  - `post-2fa-method-remove.ts`: a 2FA method removal controller.
  - `post-password-change.ts`: password change.
  - `post-reauth.ts`: re-authentication.
  - `post-reset-confirm.ts`: reset confirmation.
  - `post-email-change-confirm.ts` and `post-email-change-undo.ts`: email change.
  - `delete-account.ts`: account deletion.

  The file content does not show which counter each controller uses, so these pairings are inferred from the names.

## Notes
- `authOneTimeTokenRejectedTotal` is pre-initialised to zero for the flows `password_reset`, `email_verify`, `email_change`, `email_change_undo` and `account_restore`. This lets an `increase()` alert see the first refusal after a restart. Flow values must be literals, never request data; the file's comments name `OneTimeTokenFlow` in `services/tokens.ts` as the source of the flow names.
- Related flows deliberately have separate counters rather than extra labels. Examples are password reset request vs. confirm, email verify vs. email-change confirm vs. undo, and OAuth vs. password login. Merging them would blur what each series measures or force every existing call site to change.
- Several comments flag security-relevant failure series: login (credential stuffing), reauth, 2FA challenge, 2FA disable and backup-code regeneration (stolen-session probing), and code-sent (send endpoint abused as a mail cannon).
- Naming follows `<domain>_<subject>_total`. `accountExportFailedTotal` uses the `account_` prefix instead of `auth_`.
