---
source: src/modules/account/metrics.ts
sha256: 3b637a217f626e83a14ab83ad1c561341eb8eff3781b4309eb86ddfdab7ea812
generated_at: 2026-10-29T02:35:23.084363+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/metrics.ts

## Purpose

Defines the full set of domain-level Prometheus counters for the account/authentication module. Every counter is registered on the shared `metricsRegistry` so a single `/metrics` scrape carries them alongside HTTP metrics. This file is strictly a *write* surface for the account controllers; nothing in this module reads the counters back — the observability overview endpoint resolves them by name off the registry.

## Key elements

All exports are `Counter` instances from `prom-client`. The dominant label is `status` (success / failure / etc.), which lets one counter serve as both a volume gauge and a success-ratio signal.

| Export | Name (Prometheus) | Labels |
|---|---|---|
| `authLoginTotal` | `auth_login_total` | `status` |
| `authSignupTotal` | `auth_signup_total` | `status` |
| `authPasswordResetTotal` | `auth_password_reset_total` | `status` |
| `authPasswordResetConfirmTotal` | `auth_password_reset_confirm_total` | `status` |
| `authRefreshTotal` | `auth_refresh_total` | `status` |
| `authRefreshReuseTotal` | `auth_refresh_token_reuse_detected_total` | — |
| `authPasswordChangeTotal` | `auth_password_change_total` | `status` |
| `authReauthTotal` | `auth_reauth_total` | `status` |
| `authEmailVerifyTotal` | `auth_email_verify_total` | `status` |
| `authEmailChangeConfirmTotal` | `auth_email_change_confirm_total` | `status` |
| `authEmailChangeUndoTotal` | `auth_email_change_undo_total` | `status` |
| `authAccountDeleteTotal` | `auth_account_delete_total` | `status` (scheduled / cancelled / purged / failure) |
| `authTwoFactorEnrollTotal` | `auth_two_factor_enroll_total` | `method`, `status` |
| `authTwoFactorCodeSentTotal` | `auth_two_factor_code_sent_total` | `method`, `status` |
| `authTwoFactorDisableTotal` | `auth_two_factor_disable_total` | `method`, `status` |
| `authTwoFactorChallengeTotal` | `auth_two_factor_challenge_total` | `status` |
| `authTwoFactorBackupCodesRegenerateTotal` | `auth_two_factor_backup_codes_regenerate_total` | `status` |
| `authOauthTotal` | `auth_oauth_total` | `provider`, `status` |
| `authOneTimeTokenRejectedTotal` | `auth_one_time_token_rejected_total` | `flow` |
| `accountExportFailedTotal` | `account_export_failed_total` | — |

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — provides the single `metricsRegistry` instance that every counter in this file registers against. This is the only import.
- **Account controllers** (the remaining graph neighbors) are the *consumers*: each calls `.inc({ status })` (or the relevant label set) on the counter that matches its endpoint. For example, the password-change controller increments `authPasswordChangeTotal`, the re-auth controller increments `authReauthTotal`, the OAuth callback increments `authOauthTotal`, the 2FA confirm controller increments `authTwoFactorEnrollTotal`, etc. No controller imports another counter from this file.

## Notes

- **Pre-seeded series:** `authOneTimeTokenRejectedTotal` calls `.inc({ flow }, 0)` at module-load time for each known flow (`password_reset`, `email_verify`, `email_change`, `email_change_undo`, `account_restore`) so that `increase()` alerts fire on the very first post-restart refusal rather than on a missing-series.
- **`as const` on `labelNames`:** narrows label names to literal types, so `.inc({ status })` is compile-time-checked against the declared set instead of accepting arbitrary string keys.
- **Separate counters vs. shared labels:** intentionally distinct counters are used where two flows would otherwise be conflated (e.g., `authEmailChangeConfirmTotal` vs. `authEmailChangeUndoTotal`; `authOauthTotal` vs. `authLoginTotal`; `authPasswordResetTotal` vs. `authPasswordResetConfirmTotal`). The doc comments explain the reasoning in each case.
- **Naming convention:** Prometheus counter names follow `<domain>_<subject>_total`; the `_total` suffix is mandatory for counters per Prometheus convention.
- **Read path is external:** the only way these values surface is through the `GET /observability/metrics/overview` endpoint resolving by metric name off the registry — no code in this module or its neighbors calls `.get()` or `.getValues()`.
