# src/modules/account/metrics.ts

## Purpose

Defines and exports a fixed set of Prometheus `Counter` instances covering the account/auth domain (logins, sign-ups, resets, 2FA, token refresh, account deletion, etc.). All counters register on the shared `metricsRegistry` so a single `/metrics` scrape includes them alongside HTTP-level metrics. No code imports these to *read* values; they are resolved by name via `GET /observability/metrics/overview`.

## Key elements

- **`authLoginTotal`** (`auth_login_total`) – Login attempts, `status` label. Failure series is the primary credential-stuffing signal.
- **`authSignupTotal`** (`auth_signup_total`) – Sign-up attempts, `status` label.
- **`authPasswordResetTotal`** (`auth_password_reset_total`) – Reset *request* only (not the confirm step), `status` label.
- **`authRefreshTotal`** (`auth_refresh_total`) – Token-refresh attempts, `status` label. Failure spike ≈ unexpected logouts.
- **`authPasswordChangeTotal`** (`auth_password_change_total`) – Authenticated (current-password) change, `status` label. Kept separate from reset.
- **`authReauthTotal`** (`auth_reauth_total`) – Step-up re-auth, `status` label. Failure implies a valid session whose owner can't produce the password.
- **`authEmailVerifyTotal`** (`auth_email_verify_total`) – Verification *confirmation* (token-spend), not the send. `status` label.
- **`authTokenCleanupTotal`** (`auth_token_cleanup_total`) – Expired-token cleanup runs. **No `labelNames`** (no outcome dimension).
- **`authAccountDeleteTotal`** (`auth_account_delete_total`) – Deletion request attempts, `status` label. GDPR-relevant.
- **`authTwoFactorEnrollTotal`** (`auth_two_factor_enroll_total`) – 2FA enrollment confirm, `status` label.
- **`authTwoFactorDisableTotal`** (`auth_two_factor_disable_total`) – 2FA disable attempts, `status` label.
- **`authTwoFactorChallengeTotal`** (`auth_two_factor_challenge_total`) – Login-time 2FA challenge, `status` label.

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** – Sole non-`prom-client` import. Provides the shared `metricsRegistry` that every counter in this file registers against.
- **Account controllers** (`post-login-2fa`, `post-2fa-confirm`, `post-password-change`, `post-reauth`, `post-reset-request`, `post-signup`, `post-verify-confirm`, `get-refresh-token`, `delete-2fa`, `delete-account-request`, `delete-expired-tokens`) – Downstream consumers that import the corresponding counter and call `.inc({ status })` (or `.inc()` for `authTokenCleanupTotal`).
- **`src/modules/account/session/login-observability.ts`** – Likely wraps or references `authLoginTotal` for the login flow's observability path.
- **`src/modules/account/tests/unit/delete-account.test.ts`** – Unit test exercising the deletion flow; may assert or mock `authAccountDeleteTotal`.

## Notes

- Every counter except `authTokenCleanupTotal` carries a single `status` label (`'success' | 'failure'` in practice). That one label is what makes each counter serve as both a volume gauge and a success-ratio signal.
- `labelNames: ['status'] as const` narrows the accepted keys at the type level; omitting `as const` would accept arbitrary strings.
- Password-reset and password-change are deliberately separate counters—merging them would destroy funnel readability.
- Naming follows Prometheus convention `auth_<subject>_total`; do not add a `_count` or `_sum` suffix (those are reserved for `Histogram`/`Summary` child series).
