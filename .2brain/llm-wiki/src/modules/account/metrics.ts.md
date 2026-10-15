---
source: src/modules/account/metrics.ts
sha256: 064b9c77a78ae6eb28e67b0484ad2d54537285212a812c75c3a143b1154d20cb
generated_at: 2026-10-15T09:57:11.345530+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/metrics.ts

## Purpose

Defines and exports Prometheus `Counter` instances that track every major authentication and account-management event (login, signup, 2FA, email changes, password resets, OAuth, token lifecycle, data export). All counters register on the shared `metricsRegistry` so a single `/metrics` scrape includes both HTTP-level and domain-level signals. Nothing reads these counters programmatically; they are consumed exclusively by the metrics endpoint and alerting rules.

## Key elements

- **`authLoginTotal`** — Login attempts by `status` (success / failure). Failure spike = credential-stuffing indicator.
- **`authSignupTotal`** — Sign-up attempts by `status`. Catches broken registration faster than user reports.
- **`authPasswordResetTotal`** / **`authPasswordResetConfirmTotal`** — Separate counters for the *request* and the *token-spending* step of password reset, so the funnel is readable as two series.
- **`authRefreshTotal`** / **`authRefreshReuseTotal`** — Refresh-token operations by `status`; the second counts post-rotation reuse (token leak) with no labels.
- **`authPasswordChangeTotal`** — Authenticated password-change attempts (distinct from the reset flow).
- **`authReauthTotal`** — Step-up re-auth attempts; failure means a live session's password was wrong (stolen-session probe).
- **`authEmailVerifyTotal`** — Email-confirmation token spend (send is NOT counted; rides the email queue).
- **`authEmailChangeConfirmTotal`** / **`authEmailChangeUndoTotal`** — Separate counters for confirm vs. undo token spend; tokens are cross-rejecting by design.
- **`authTokenCleanupTotal`** — Expired-token cleanup runs; no `status` label (binary maintenance job).
- **`authAccountDeleteTotal`** — Account-deletion requests by `status` (GDPR-weighted).
- **`authTwoFactorEnrollTotal`** — 2FA enrollment confirmations by `method` + `status`.
- **`authTwoFactorCodeSentTotal`** — 2FA codes sent by `method` + `status`; the only 2FA counter an unauthenticated caller can move.
- **`authTwoFactorDisableTotal`** — 2FA disable attempts by `method` + `status`.
- **`authTwoFactorChallengeTotal`** — Login-time 2FA challenge by `status`; password already verified.
- **`authTwoFactorBackupCodesRegenerateTotal`** — Backup-code regeneration by `status`.
- **`authOauthTotal`** — OAuth login/signup by `provider` + `status`; kept separate from `authLoginTotal` to avoid a `provider: 'password'` label on every existing call site.
- **`authOneTimeTokenRejectedTotal`** — Rejected one-time link tokens by `flow` (literal values, never request data). Pre-initialised to zero for all five flows at module load.
- **`accountExportFailedTotal`** — Failed data-export builds (Art. 15 GDPR); no labels.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Imports `metricsRegistry` and registers every counter on it, making them available on the shared Prometheus registry.
- **All listed controllers** (`delete-2fa-method`, `delete-2fa`, `delete-account-request`, `get-oauth-callback`, `get-refresh-token`, `post-2fa-backup-codes`, `post-2fa-confirm`, `post-email-change-confirm`, `post-email-change-undo`, `post-login-2fa-send`, `post-login-2fa`, `post-password-change`, `post-reauth`, `post-reset-confirm`) — Each controller imports the relevant counter(s) from this file and calls `.inc({ status, … })` at its success and failure paths. This file is the sole source of truth for the metric names and label schemas those call sites use.

## Notes

- Every counter uses `labelNames: […] as const` to get literal-type checking on `inc()` label keys at the call site.
- `authOneTimeTokenRejectedTotal` is pre-seeded with `.inc({ flow }, 0)` for each flow literal at module load (Prometheus best-practice: avoids a missing-time-series gap after a restart that would break `increase()` alerts).
- `authTokenCleanupTotal` and `authRefreshReuseTotal` intentionally have **no** labels — the event is binary or fully identified by its existence.
- The `status` label is the convention that lets a single counter serve as both a volume gauge and a success-ratio signal; alerting rules compute the ratio from the two label series.
- Counter names follow the Prometheus convention `<domain>_<subject>_total`; the domain prefix is `auth_` for auth flows and `account_` for account-lifecycle flows (export).
