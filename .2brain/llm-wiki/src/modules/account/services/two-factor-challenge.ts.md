---
source: src/modules/account/services/two-factor-challenge.ts
sha256: db95421d3ed27ada3c4360b33ca75313ad4e58cb90decdcc7040804c9ad2cdec
generated_at: 2026-10-14T08:55:16.778290+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor-challenge.ts

## Purpose

Implements the second step of a 2FA login: building a challenge, delivering a code against it, and verifying the code. It deliberately stops short of minting a session — `../controllers/post-login-2fa.ts` is responsible for turning a verified challenge into cookies.

## Key elements

- **`MFA_CHALLENGE_TTL_MS`** (const, 5 min) — TTL for challenges whose armed factors are all device-read.
- **`MFA_CHALLENGE_DELIVERED_TTL_MS`** (exported const, 10 min) — TTL when at least one armed factor delivers (email/SMS). Exported so `rate-limits.ts` can window its two MFA budgets to the same lifetime.
- **`buildLoginChallenge(user, amr)`** — Builds the `{ mfaRequired, challenge, expiresAt, methods, defaultMethod }` body returned by `POST /account/login`. Chooses TTL based on whether any armed handler delivers, then mints the challenge via `issueToken`.
- **`sendLoginCode(challenge, method, context)`** — Handler for `POST /account/login/2fa/send`. Validates the challenge, resolves the named method, enforces delivery cooldown, calls the handler's `send`, and persists the updated methods. Returns 422 for both unknown and non-deliverable methods (no enumeration).
- **`VerifiedChallenge`** (exported interface) — `{ user, amr }` shape handed to the controller on success.
- **`verifyLoginChallenge(challenge, code, context)`** — Handler for `POST /account/login/2fa`. Verifies the code via `verifyArmedFactor`, then atomically spends the token via `spendLiveToken`; only the request whose write removed the token may proceed. Audits failures only.

## Relationships

- **`services/tokens.ts`** — Provides the full token lifecycle: `issueToken` (create), `findLiveToken` / `findLiveTokenEntry` (read), `spendLiveToken` (atomic delete-on-success). The challenge is a regular entry in the `verificationtokens` store, not a JWT.
- **`services/two-factor-lockout.ts`** — `armedEntries` enumerates which factors are active for a user; `verifyArmedFactor` checks the submitted code; `settleVerdict` applies lockout consequences.
- **`services/two-factor-outcomes.ts`** — `audited` wraps outcomes with an audit log call; `summarize` shapes a handler for the `methods` array; `tooSoon` builds the standard cooldown-retry response.
- **`token-types.ts`** — Supplies `MFA_CHALLENGE_TOKEN_TYPE`, the discriminator used in every token lookup/spend.
- **`audit.ts`** (module-level) — Provides `accountAuditActions` constants (`AUTH_2FA_CODE_SENT`, `AUTH_2FA_CHALLENGE_FAILED`) passed to the audit logger.
- **`rate-limits.ts`** — Consumes the exported `MFA_CHALLENGE_DELIVERED_TTL_MS` to ensure the rate-limit window never ends before the challenge it bounds.
- **`infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape every return value.
- **`infrastructure/http/errors.ts`** — `rejectDatabaseEnvelope` wraps unexpected DB errors into a safe 500.
- **`infrastructure/observability/audit.ts`** — `recordAudit` writes the failure audit entry in `verifyLoginChallenge`.
- **`infrastructure/i18n/index.ts`** — `t` resolves user-facing error strings.
- **`services/index.ts`** — Re-exports the public API of this module.

## Notes

- The challenge is a **single-use, revocable, hashed-at-rest** token (same mechanism as password-reset and account-deletion), not a JWT. A second presentation of an already-answered challenge is refused outright by `spendLiveToken`'s atomic check.
- **Concurrency guard:** `spendLiveToken` returns a boolean (`spentByThisRequest`). A concurrent twin that reads the token before this request's write lands will see `false` and get a 401, as if the challenge never existed.
- **Failure keeps the challenge live:** a wrong code does not delete the token; the `mfaChallengeLimiter` rate-limit bounds retry attempts.
- **Audit asymmetry:** `verifyLoginChallenge` records an audit entry only on failure. A success is *not* a completed login — `postLoginTwoFactor` fires `AUTH_LOGIN` once a session actually exists. Auditing success here would claim a login before it has occurred.
- **No method enumeration:** `sendLoginCode` returns the identical 422 for an unknown method name and for a known-but-non-deliverable method, so a caller holding only a challenge token cannot probe what the account has enrolled.
