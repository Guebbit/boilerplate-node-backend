---
source: src/modules/account/metrics.ts
sha256: 6fe2a17b420dd72234209334f58aaae4244336a0e4e0a51bc87653f521d84a60
generated_at: 2026-09-23T18:05:23.117424+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/metrics.ts

## Purpose

Defines the full set of Prometheus `Counter` metrics for every authentication-domain event (login, signup, password flows, token refresh, 2FA, OAuth, account deletion, etc.) and registers each one on the shared `metricsRegistry`. No code in this file increments or reads the counters; it is purely a declaration module so that all auth signals appear in the same `/metrics` scrape as the generic HTTP metrics.

## Key elements

- **`authLoginTotal`** – Login attempts, labelled by `status` (success/failure). Failure series is the credential-stuffing signal.
- **`authSignupTotal`** – Sign-up attempts, labelled by `status`.
- **`authPasswordResetTotal`** – Password-reset _request_ attempts (not the confirmation step), labelled by `status`.
- **`authRefreshTotal`** – Refresh-token operations, labelled by `status`.
- **`authPasswordChangeTotal`** – Authenticated password-change attempts, labelled by `status`. Kept separate from `authPasswordResetTotal` so the two funnels remain readable.
- **`authReauthTotal`** – Step-up re-authentication attempts, labelled by `status`. Failure here implies a stolen live session, not a mistyped credential.
- **`authEmailVerifyTotal`** – Email-verification token confirmations, labelled by `status`.
- **`authEmailChangeConfirmTotal`** – Email-change token confirmations, labelled by `status`. Separate counter from `authEmailVerifyTotal` because the two tokens are mutually exclusive by design.
- **`authTokenCleanupTotal`** – Expired-token cleanup runs. **No labels** – a binary ran/didn't-ran counter.
- **`authAccountDeleteTotal`** – Account-deletion request attempts, labelled by `status`.
- **`authTwoFactorEnrollTotal`** – 2FA enrollment confirmations, labelled by `method` + `status`.
- **`authTwoFactorCodeSentTotal`** – Login-time 2FA codes dispatched, labelled by `method` + `status`. The one 2FA counter an unauthenticated caller can move.
- **`authTwoFactorDisableTotal`** – 2FA disable attempts, labelled by `method` + `status`.
- **`authTwoFactorChallengeTotal`** – Login-time 2FA challenge (`POST /account/login/2fa`) attempts, labelled by `status`.
- **`authTwoFactorBackupCodesRegenerateTotal`** – Backup-code regeneration attempts, labelled by `status`.
- **`authOauthTotal`** – OAuth login/signup attempts, labelled by `provider` + `status`. Separate from `authLoginTotal` to avoid breaking existing password-funnel series.

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** – Imported as `metricsRegistry`; every counter passes it in its `registers` array. This is the single write dependency of the file.
- **`src/modules/account/controllers/*`** (14 controller files) – These are the call sites that import the counters above and call `.inc()` with the appropriate label values after their respective operations succeed or fail. This file itself imports no controller; the dependency is one-directional (controllers → this file).

## Notes

- **Label convention:** Every counter except `authTokenCleanupTotal` carries a `status` label (success/failure), which doubles each counter as both a volume and a success-ratio signal. 2FA and OAuth counters add a second label (`method` or `provider`) alongside `status`.
- **Type-safety trick:** `labelNames` are declared with `as const` (e.g. `['method', 'status'] as const`), so `inc({ status })` is checked against the literal set rather than accepting arbitrary string keys.
- **Read path:** Nothing in the codebase imports these counters to _read_ them. `GET /observability/metrics/overview` resolves metrics by name off the shared registry, so the exports here exist solely so controllers can import and increment them.
- **Intentional separation:** Several "similar" operations get distinct counters rather than a shared counter with an extra label (e.g. password reset vs. password change; email-verify vs. email-change-confirm; OAuth vs. password login). The rationale in each docstring is that mixing them would obscure per-flow funnels or force every existing call site to add a default label.
