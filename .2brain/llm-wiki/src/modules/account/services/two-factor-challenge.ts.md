---
source: src/modules/account/services/two-factor-challenge.ts
sha256: f3e7450f92c2dad658d82c12b40b5795cc623a1b6231ba90249d47040aaa4e9e
generated_at: 2026-11-08T04:24:00.795291+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor-challenge.ts

## Purpose

Implements the second step of a two-factor login: building an MFA challenge, delivering a code against it, and verifying a submitted code. It deliberately stops short of minting a session — that is the job of `../controllers/post-login-2fa.ts`, which receives the `VerifiedChallenge` this module returns.

## Key elements

- **`MFA_CHALLENGE_TTL_MS`** — 5-minute lifetime for challenges whose armed factors are all read-off-device. Also consumed by the deletion-restore claim check.
- **`MFA_CHALLENGE_DELIVERED_TTL_MS`** — 10-minute lifetime when at least one armed factor delivers via SMTP. Also the window used by `../rate-limits.ts` for the MFA challenge budgets.
- **`buildLoginChallenge(user, amr)`** — Issues a single-use `MFA_CHALLENGE_TOKEN_TYPE` token (via `issueToken`) and returns the `{ mfaRequired, challenge, expiresAt, methods, defaultMethod }` body for `POST /account/login`. TTL is chosen based on whether any armed handler delivers.
- **`sendLoginCode(challenge, method, context)`** — Handles `POST /account/login/2fa/send`. Validates the live challenge, delegates to `deliverArmedCode`, and wraps the result in an audit envelope (`AUTH_2FA_CODE_SENT`).
- **`VerifiedChallenge`** (interface) — `{ user, amr }` returned on successful verification; the controller uses it to mint the session.
- **`verifyLoginChallenge(challenge, code, context)`** — Handles `POST /account/login/2fa`. Looks up the live token entry, verifies the code via `verifyArmedFactor`/`settleVerdict`, then **spends** the token (only the request that removes it may proceed). Audits failures only (`AUTH_2FA_CHALLENGE_FAILED`); success is left to the controller's `AUTH_LOGIN` audit.

## Relationships

- **`./tokens`** — `issueToken`, `findLiveToken`, `findLiveTokenEntry`, `spendLiveToken` provide the single-use, hashed-at-rest token store underlying the challenge.
- **`./two-factor-outcomes`** — `armedEntries` resolves which factors are active; `deliverArmedCode` handles the actual code dispatch; `audited` wraps results in an audit envelope; `summarize` produces the per-method descriptor in the challenge body.
- **`./two-factor-lockout`** — `verifyArmedFactor` checks the code against the user's factors; `settleVerdict` records the attempt and returns a success/failure verdict consumed here.
- **`../audit`** — `accountAuditActions` supplies the action identifiers (`AUTH_2FA_CODE_SENT`, `AUTH_2FA_CHALLENGE_FAILED`) for audit records.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape every return value.
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope` normalises unexpected DB failures into a safe HTTP response.
- **`@infrastructure/i18n`** — `t` provides user-facing error messages.
- **`@infrastructure/observability/audit`** — `recordAudit` fires the failure audit in `verifyLoginChallenge`.
- **`@domain-primitives/time`** — `MINUTE_MS` is the unit for the two TTL constants.
- **`../services/deletion-sign-in`** (via comment) — reuses `MFA_CHALLENGE_TTL_MS` for its restore-claim window.

## Notes

- The challenge token is **single-use and revocable**, not a JWT. A correct code triggers `spendLiveToken`; a wrong code leaves it live and relies on `mfaChallengeLimiter` to bound retries.
- Only the request whose own write removed the token may proceed (`spentByThisRequest` guard). A concurrent twin receives a 401 as if the challenge never existed.
- Both "invalid challenge" and "account has no 2FA" return the same `401` with no distinguishing message, to avoid leaking which condition was hit.
- `amr` is stored on the token entry and must be present; a missing `amr` causes a 401 rather than silently defaulting to a password proof.
- Success in `verifyLoginChallenge` is intentionally **not** audited here — the session does not exist yet. The controller fires `AUTH_LOGIN` after cookies are set.
