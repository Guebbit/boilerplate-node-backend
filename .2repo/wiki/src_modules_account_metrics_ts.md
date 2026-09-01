# src/modules/account/metrics.ts

## Purpose

Defines the set of Prometheus `Counter` metrics for the account/auth domain (login, sign-up, password reset, refresh, verify, cleanup, deletion). All counters register onto the shared `metricsRegistry`, so a single `/metrics` scrape returns them alongside HTTP-level metrics. No consumer imports these to *read* values; the overview endpoint resolves them by name off the registry.

## Key elements

- **`authLoginTotal`** – Login attempts, labelled `status` (success/failure). Failure spike = credential-stuffing signal.
- **`authSignupTotal`** – Sign-up attempts, labelled `status`.
- **`authPasswordResetTotal`** – Password-reset *request* attempts (the link-request step only, not the confirm step), labelled `status`.
- **`authRefreshTotal`** – Refresh-token operations, labelled `status`. Failure rise = silent session drops.
- **`authPasswordChangeTotal`** – Authenticated (current-password) change attempts, labelled `status`. Deliberately separate from `authPasswordResetTotal` to keep the funnel readable.
- **`authEmailVerifyTotal`** – Email-verification *confirmation* (token-spending) attempts, labelled `status`. Does not count the send.
- **`authTokenCleanupTotal`** – Expired-token cleanup runs. **No `labelNames`** — a bare counter for "did the job run at all."
- **`authAccountDeleteTotal`** – Account-deletion request attempts, labelled `status`.

All counters use the `labelNames: ['status'] as const` pattern (except cleanup) for compile-time label validation.

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** — Provides the `metricsRegistry` instance that every counter in this file registers into (`registers: [metricsRegistry]`).
- **`src/modules/account/controllers/post-login.ts`** — Increments `authLoginTotal` with the outcome label.
- **`src/modules/account/controllers/post-signup.ts`** — Increments `authSignupTotal`.
- **`src/modules/account/controllers/post-reset-request.ts`** — Increments `authPasswordResetTotal`.
- **`src/modules/account/controllers/get-refresh-token.ts`** — Increments `authRefreshTotal`.
- **`src/modules/account/controllers/post-password-change.ts`** — Increments `authPasswordChangeTotal`.
- **`src/modules/account/controllers/post-verify-confirm.ts`** — Increments `authEmailVerifyTotal`.
- **`src/modules/account/controllers/delete-expired-tokens.ts`** — Increments `authTokenCleanupTotal`.
- **`src/modules/account/controllers/delete-account-request.ts`** — Increments `authAccountDeleteTotal`.
- **`src/modules/account/tests/unit/delete-account.test.ts`** — Exercises the delete-account flow, covering the `authAccountDeleteTotal` increment path.

## Notes

- **Naming convention:** `auth_<subject>_total` for counters; the `_total` suffix follows Prometheus convention for monotonically-increasing counters (the `/metrics` exposition strips it per the OpenMetrics spec).
- **`status` label as the universal dimension:** Every labelled counter in this module uses `status` as its sole label. This means the same metric serves as both a volume gauge and a success/failure ratio — no separate `_success` / `_failure` series are needed.
- **`authPasswordResetTotal` vs `authPasswordChangeTotal`:** These are intentionally split. Merging them would make it impossible to read the reset funnel (request → confirm) independently of the authenticated change flow.
- **`authTokenCleanupTotal` has no labels** — it's a maintenance heartbeat, not a user-facing operation.
- **Registration is one-way:** These counters are *written* by controllers; nothing in this file reads them. The observability layer resolves by metric name at scrape time.
