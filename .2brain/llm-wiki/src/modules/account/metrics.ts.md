---
source: src/modules/account/metrics.ts
sha256: 2928d76e39629b84f1b25589f808f38f6990a656961fe350894d140984bcf840
generated_at: 2026-11-08T04:10:50.816440+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/metrics.ts

## Purpose

Declares the full set of Prometheus counters for the account/auth domain (login, sign-up, password flows, 2FA, email verification, account lifecycle, OAuth, data export). Each counter registers itself on the shared `metricsRegistry` so a single `/metrics` scrape includes them alongside HTTP-level metrics. Nothing in the codebase reads these counters programmatically; dashboards and alerts resolve them by metric name off the registry.

## Key elements

- **`authLoginTotal`** – Login attempts, labelled `status` (success/failure).
- **`authSignupTotal`** – Sign-up attempts, labelled `status`.
- **`authPasswordResetTotal`** – Password-reset *request* attempts (not confirmation), labelled `status`.
- **`authPasswordResetConfirmTotal`** – Password-reset *confirmation* (token-spend) attempts, labelled `status`.
- **`authRefreshTotal`** – Refresh-token operations, labelled `status`.
- **`authRefreshReuseTotal`** – Refresh-token reuse (post-rotation, outside grace). No labels.
- **`authPasswordChangeTotal`** – Authenticated password-change attempts (distinct from reset), labelled `status`.
- **`authReauthTotal`** – Step-up re-authentication attempts, labelled `status`.
- **`authEmailVerifyTotal`** – Email-verification confirmation attempts, labelled `status`.
- **`authEmailChangeConfirmTotal`** – Email-change confirmation (token-spend), labelled `status`.
- **`authEmailChangeUndoTotal`** – Email-change undo (token-spend), labelled `status`.
- **`authAccountDeleteTotal`** – Account deletions, labelled `status` (scheduled / canceled / purged / failure).
- **`authTwoFactorEnrollTotal`** – 2FA enrollment confirmations, labelled `method` + `status`.
- **`authTwoFactorCodeSentTotal`** – 2FA codes sent, labelled `method` + `status`.
- **`authTwoFactorChallengeTotal`** – Login-time 2FA challenge attempts, labelled `status`.
- **`authTwoFactorDisableTotal`** – 2FA disable attempts, labelled `method` + `status`.
- **`authTwoFactorBackupCodesRegenerateTotal`** – Backup-code regeneration attempts, labelled `status`.
- **`authOauthTotal`** – OAuth login/signup attempts, labelled `provider` + `status`.
- **`authOneTimeTokenRejectedTotal`** – One-time link tokens refused, labelled `flow` (password_reset, email_verify, email_change, email_change_undo, account_restore). Pre-initialized to zero for every flow at module load.
- **`accountExportFailedTotal`** – Data-export build failures. No labels.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Provides the `metricsRegistry` instance that every counter in this file registers with. This is the only import in the file.
- **Account controllers** (each listed neighbor) — Import the relevant counter(s) from this module and call `.inc({ status }, …)` (or with `method`/`provider`/`flow`) at the end of their request handlers to record the outcome. For example, `post-reauth.ts` increments `authReauthTotal`; `get-oauth-callback.ts` increments `authOauthTotal`; `delete-account.ts` increments `authAccountDeleteTotal`. The file itself holds no business logic and is consumed exclusively for side-effect increments.

## Notes

- **`as const` on `labelNames`** — Narrows label keys to string literals so `.inc()` calls are type-checked against the declared label set rather than accepting arbitrary strings.
- **Pre-zeroed labels** — `authOneTimeTokenRejectedTotal` calls `.inc({ flow }, 0)` for every known `flow` value at module load time. This follows the Prometheus instrumentation guideline to avoid missing metrics on `increase()` alerts after a restart.
- **Request vs. confirmation are separate counters** — Several flows (password reset, email verify, email change) deliberately split the "request/link" step from the "confirm/token-spend" step into distinct metric names rather than a shared counter with a `step` label, so each series can be read as an independent funnel stage.
- **No `help` text duplication for dashboards** — The `help` strings are the only human-readable description of each metric; Grafana panels and alert rules rely on them.
- **`accountExportFailedTotal`** is the only counter with an `account_` prefix rather than `auth_`; it tracks a data-privacy obligation (Art. 15) rather than an authentication event.
