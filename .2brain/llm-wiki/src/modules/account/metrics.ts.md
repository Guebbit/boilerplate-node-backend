---
source: src/modules/account/metrics.ts
sha256: 5dc52aae3a005f614ab73e00e7d8a3154958993b62c04be849684e35f278b4c2
generated_at: 2026-10-14T08:41:02.112833+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/metrics.ts

## Purpose

Defines the full set of domain-owned Prometheus counters for account/authentication operations (login, signup, 2FA, password reset, email change, OAuth, etc.). All counters are registered on the shared `metricsRegistry` so a single `/metrics` scrape carries them alongside HTTP metrics. Nothing imports these counters to *read* them; the `GET /observability/metrics/overview` endpoint resolves them by name off the registry.

## Key elements

- **`authLoginTotal`** – Login attempts, labelled by `status` (success/failure). Failure series is the credential-stuffing signal.
- **`authSignupTotal`** – Sign-up attempts by outcome.
- **`authPasswordResetTotal`** – Password-reset *request* (link generation) only, by outcome.
- **`authPasswordResetConfirmTotal`** – Password-reset *confirmation* (token spend) only, by outcome.
- **`authRefreshTotal`** – Refresh-token operations by outcome.
- **`authRefreshReuseTotal`** – Refresh-token reuse (leaked token detected post-rotation). No labels.
- **`authPasswordChangeTotal`** – Authenticated password-change attempts by outcome (distinct from reset).
- **`authReauthTotal`** – Step-up re-authentication attempts by outcome.
- **`authEmailVerifyTotal`** – Email-verification confirmations (token spend) by outcome.
- **`authEmailChangeConfirmTotal`** – Email-change confirmations by outcome.
- **`authEmailChangeUndoTotal`** – Email-change undo attempts by outcome.
- **`authTokenCleanupTotal`** – Expired-token cleanup runs. No labels.
- **`authAccountDeleteTotal`** – Account-deletion requests by outcome.
- **`authTwoFactorEnrollTotal`** – 2FA enrollment confirmations by `method` and `status`.
- **`authTwoFactorCodeSentTotal`** – 2FA codes sent by `method` and `status`.
- **`authTwoFactorDisableTotal`** – 2FA disable attempts by `method` and `status`.
- **`authTwoFactorChallengeTotal`** – Login-time 2FA challenges by `status`.
- **`authTwoFactorBackupCodesRegenerateTotal`** – Backup-code regeneration by `status`.
- **`authOauthTotal`** – OAuth login/signup by `provider` and `status` (separate from `authLoginTotal`).
- **`authOneTimeTokenRejectedTotal`** – One-time link tokens refused by `flow` (`password_reset`, `email_verify`, `email_change`, `account_delete`).
- **`accountExportFailedTotal`** – Data exports whose build failed. No labels.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** – Provides the shared `Counter` registry (`metricsRegistry`) that every counter in this file registers against at construction time.
- **Controllers in `src/modules/account/controllers/`** (e.g. `post-login-2fa.ts`, `post-password-change.ts`, `delete-account-request.ts`, `get-refresh-token.ts`, `get-oauth-callback.ts`, etc.) – Import specific counters from this file and call `.inc({ … })` at the relevant success/failure branches. Each controller touches only the one or two counters matching its operation.

## Notes

- The `status` label (typically `success` / `failure`) is the convention that makes every labelled counter serve as both a volume gauge and a success-ratio signal in a single metric.
- `labelNames` uses `as const` so `.inc({ status })` is type-checked against the declared literals rather than accepting arbitrary strings.
- `authOneTimeTokenRejectedTotal` is pre-initialised to zero for all four flows at module load time so that an `increase()` PromQL alert fires on the very first refusal after a restart (avoids the "missing metric" false-negative described in the Prometheus documentation).
- Counters that represent distinct user actions (e.g. password-reset request vs. confirm, email-verify vs. email-change-confirm) are intentionally **separate metrics** rather than labels on one metric, to keep funnels independently readable and to prevent conflating security signals.
- `authOauthTotal` is deliberately a separate metric from `authLoginTotal` to avoid forcing every existing call site to add a `provider: 'password'` label, which would break historical series.
- Three counters (`authTokenCleanupTotal`, `authRefreshReuseTotal`, `accountExportFailedTotal`) have **no** `labelNames` — they are simple occurrence counters with no meaningful outcome dimension.
