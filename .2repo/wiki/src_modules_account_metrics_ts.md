# src/modules/account/metrics.ts

## Purpose

Defines and exports Prometheus counters for the auth/account domain. These are registered on the shared `metricsRegistry` so a single `/metrics` scrape includes them alongside HTTP metrics. They exist as cheap, always-on aggregates suitable for alerting (e.g., "signup failure ratio above 20% for 5 min")—a use case distinct from audit logs or analytics pipelines.

## Key elements

- **`authLoginTotal`** – `auth_login_total` counter, labelled `status`. Tracks login attempts; the failure series is the credential-stuffing signal.
- **`authSignupTotal`** – `auth_signup_total` counter, labelled `status`. Top-of-funnel sign-up volume and failure rate.
- **`authPasswordResetTotal`** – `auth_password_reset_total` counter, labelled `status`. Counts the *initial* reset-link request only (not the confirmation step).
- **`authRefreshTotal`** – `auth_refresh_total` counter, labelled `status`. Token-refresh attempts; failures indicate unexpected session drops.
- **`authPasswordChangeTotal`** – `auth_password_change_total` counter, labelled `status`. Authenticated password change (current-password flow), kept separate from the reset flow.
- **`authEmailVerifyTotal`** – `auth_email_verify_total` counter, labelled `status`. Token-spending confirmation step; proxies for link-deliverability.
- **`authTokenCleanupTotal`** – `auth_token_cleanup_total` counter, **no labels**. Maintenance-job ran-or-didn't; confirms the expired-token sweeper is alive.
- **`authAccountDeleteTotal`** – `auth_account_delete_total` counter, labelled `status`. Account-deletion requests (GDPR erasure).

All counters use `labelNames: ['status'] as const` (except `authTokenCleanupTotal`) so that `inc({ status })` calls are type-checked against the literal `'success' | 'failure'` strings.

## Relationships

- **Imports** `metricsRegistry` from `src/infrastructure/observability/metrics-http.ts` — the shared registry that the `/metrics` endpoint scrapes.
- **Imported by** the account controllers that emit the corresponding events:
  - `post-login.ts` → increments `authLoginTotal`
  - `post-signup.ts` → increments `authSignupTotal`
  - `post-reset-request.ts` → increments `authPasswordResetTotal`
  - `get-refresh-token.ts` → increments `authRefreshTotal`
  - `post-password-change.ts` → increments `authPasswordChangeTotal`
  - `post-verify-confirm.ts` → increments `authEmailVerifyTotal`
  - `delete-expired-tokens.ts` → increments `authTokenCleanupTotal`
  - `delete-account-request.ts` → increments `authAccountDeleteTotal`
- **Tested indirectly** via `tests/unit/delete-account.test.ts` (asserts the counter increments on the delete flow).

## Notes

- Counters are **write-only** from the domain side; the `GET /observability/metrics/overview` endpoint reads values by name off the registry. Deleting this file removes the counters from the scrape (overview reports zero) but does not break compilation.
- `authPasswordResetTotal` and `authPasswordChangeTotal` are deliberately separate: conflating the two email-reset steps (request + confirm) or mixing them with the authenticated change flow would make funnel math ambiguous.
- `authTokenCleanupTotal` intentionally has no `status` label—there is no meaningful success/failure axis for a cron-style job.
- Prometheus naming convention used: `<domain>_<subject>_total` for counters.
