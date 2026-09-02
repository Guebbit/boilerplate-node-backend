# docs/tools/security.md

## Purpose

Documents the security posture of the backend: the middleware and libraries that harden the Express app, the split-token auth model (short-lived Bearer access tokens + HTTP-only refresh-token cookies), TOTP two-factor authentication, the four rate-limit budgets, the metrics-endpoint credential, `$regex` input escaping, and `trust proxy` configuration. It exists so that engineers and AI assistants understand *why* each control is shaped the way it is before modifying any of the endpoints or middleware it governs.

## Key elements

- **Security middleware stack** — Helmet (default headers), cors (origin allowlist), express-rate-limit (edge abuse protection), cookie-parser, bcrypt (password hashing), jsonwebtoken (HS256 access/refresh tokens).
- **Split-token auth model** — Access token (short-lived JWT, `Authorization: Bearer` header) + Refresh token (longer-lived JWT in `httpOnly`/`sameSite=lax`/`secure` `jwt` cookie). Verified by `getAuth` → `verifyAccessToken` and `createAccessToken` → `verifyRefreshToken` (signature + `users.tokens` DB presence).
- **TOTP 2FA** — AES-256-GCM encrypted secret (`NODE_TOTP_ENCRYPTION_KEY`, versioned for rotation), sha256-hashed backup codes, two-step enrollment, discriminated-union login response, single-purpose challenge token, per-account time-step replay tracking, admin-only recovery.
- **Rate-limit budgets** —
  - Global: 100 req/min (browsing-sized, per-minute window).
  - Credential (`POST /account/login`): smaller per-route budget, `skipSuccessfulRequests: true`.
  - Submission (`POST /contact`): `skipSuccessfulRequests: false` (success = abuse signal), `NODE_SUBMISSION_RATE_LIMIT_MAX=5`.
  - Upload (image routes across products/users/account): `skipSuccessfulRequests: false` (decode/resize CPU cost), `NODE_UPLOAD_RATE_LIMIT_MAX=20`.
- **Metrics endpoint credential** — Static bearer token for Prometheus scraping; `timingSafeEqual` comparison; deny-by-default when `NODE_METRICS_TOKEN` is unset.
- **`$regex` escaping** — Search terms are escaped before reaching MongoDB `$regex` to prevent ReDoS and to treat input as literal text; empty-after-strip returns `undefined` (not `''`) to avoid matching all documents.
- **`trust proxy` guidance** — Two failure modes (unset vs. misconfigured) for `request.ip` used by rate-limit buckets and audit logs.

## Relationships

- **`docs/modules/account.md`** — The login (`POST /account/login`), refresh (`GET /account/refresh`), and 2FA setup/confirm endpoints whose security behavior (token issuance, challenge flow, rate limits) is specified here.
- **`docs/modules/account-sessions.md`** — Session lifecycle and token storage (`users.tokens`) that `verifyRefreshToken` checks for revocation; the split-token model defined here is the session contract.
- **`docs/modules/feedback.md`** — `POST /contact` is the sole route guarded by `submissionLimiter`; the inverted `skipSuccessfulRequests` rule is documented here.
- **`docs/modules/users.md`** — `users.tokens` store used by refresh verification; the admin surface for 2FA recovery; upload routes covered by `uploadLimiter`.
- **`docs/reference/ops.md`** — Runtime environment variables referenced throughout (`NODE_TOTP_ENCRYPTION_KEY`, `NODE_MFA_CHALLENGE_MAX`, `NODE_SUBMISSION_RATE_LIMIT_MAX`, `NODE_UPLOAD_RATE_LIMIT_MAX`, `NODE_METRICS_TOKEN`) and the `.env-example` / compose config that set the metrics token.
- **`docs/reference/src-infrastructure.md`** — Where Helmet, CORS, rate-limiters, `trust proxy`, and the Express app wiring live in source; this page describes *why* they are configured as they are.
- **`docs/reference/tests.md`** — Test suites raise rate-limit budgets tenfold (via `tests/support/setup.ts`) to avoid 429s in CI; the credential-endpoint and 2FA flows are exercised here.
- **`docs/theory/web-attack-catalog.md`** — The threats each control addresses (ReDoS via `$regex`, timing attacks via `===` vs. `timingSafeEqual`, CSRF via `sameSite`, brute-force via rate limits, token replay via time-step tracking).
- **`docs/theory/data-protection.md`** — Password hashing (bcrypt), TOTP secret encryption, backup-code hashing, and refresh-token storage all fall under the data-protection policy summarized here.
- **`docs/theory/request-flow.md`** — The login → auth → refresh sequence (steps 1–7) is the canonical request-flow example for the auth path.
- **`docs/theory/architecture.md`** — The split-token model and the four-budget rate-limit design are architectural decisions this page justifies.

## Notes

- The file was truncated in the provided content; the `trust proxy` section (table of two failure modes) is incomplete. The full table likely distinguishes "unset" (all requests appear to come from the proxy's IP) from "set too high" (internal client IPs are trusted, spoofing the rate-limit bucket key).
- `skipSuccessfulRequests` being **on** for credentials but **off** for submissions and uploads is a deliberate inversion, not an oversight—do not "unify" them.
- The `$regex` escaping returns `undefined` (not `''`) for terms that vanish after stripping; treating it as empty would match every document.
- The 2FA challenge token is single-purpose: the session resolver explicitly rejects it, so it can never authenticate a request by itself.
- The metrics endpoint uses a static credential, not the admin JWT—Prometheus cannot perform login/refresh. An unset `NODE_METRICS_TOKEN` denies access rather than opening the endpoint.
- Test environments multiply all rate-limit budgets by 10×; do not remove this override when adding new routes.
