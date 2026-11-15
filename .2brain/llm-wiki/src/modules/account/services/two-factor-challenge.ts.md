---
source: src/modules/account/services/two-factor-challenge.ts
sha256: 3af53cc673892b720e718a10aab2fbe8e6c04f99dd239494cf18e1cf7d082859
generated_at: 2026-11-14T18:52:49.313827+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor-challenge.ts

## Purpose

Implements the second factor of a login: building the MFA challenge, delivering a code against it, and verifying a submitted code. It deliberately stops short of minting a session or setting cookies — the `post-login-2fa` controller performs that final step. All logic here is reusable service-level code that the controllers call.

## Key elements

- **`MFA_CHALLENGE_TTL_MS`** (exported) — 5-minute lifetime for challenges whose armed factors are all device-read.
- **`MFA_CHALLENGE_DELIVERED_TTL_MS`** (exported) — 10-minute lifetime when at least one armed factor delivers (e.g. email). Consumed by `../rate-limits.ts` to window the two MFA challenge budgets.
- **`buildLoginChallenge(user, amr)`** (exported) — Mints a single-use `MFA_CHALLENGE_TOKEN_TYPE` token via `issueToken`, picks the correct TTL based on whether any armed handler delivers, and returns the `{ mfaRequired, challenge, expiresAt, methods, defaultMethod }` body for `POST /account/login`.
- **`sendLoginCode(challenge, method, context)`** (exported) — Handler logic for `POST /account/login/2fa/send`. Looks up the live challenge, delegates to `deliverArmedCode`, and wraps the result in an audit record (`AUTH_2FA_CODE_SENT`).
- **`VerifiedChallenge`** (exported interface) — `{ user, amr }` shape handed to the controller on a successful verify.
- **`redeemChallenge(user, amr, challenge)`** (internal) — Atomically spends the challenge token via `spendThen`; only the request whose own write removed it may proceed to `persistTwoFactorMethods`.
- **`verifyLoginChallenge(challenge, code, context)`** (exported) — Handler logic for `POST /account/login/2fa`. Looks up the live token, verifies the code via `verifyArmedFactor`, settles the verdict through `settleVerdict`, and redeems the challenge. Records an audit entry (`AUTH_2FA_CHALLENGE_FAILED`) **only on failure**; success auditing is left to the controller.

## Relationships

- **`src/modules/account/services/tokens.ts`** — Primary token lifecycle: `issueToken` mints, `findLiveToken` / `findLiveTokenEntry` read, `spendThen` atomically consumes.
- **`src/modules/account/services/two-factor-lockout.ts`** — `verifyArmedFactor` checks the submitted code; `settleVerdict` applies lockout/counter logic before allowing redemption.
- **`src/modules/account/audit.ts`** — Provides `accountAuditActions` enum values used in audit records.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape every return.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseEnvelope` normalises unexpected DB errors.
- **`src/infrastructure/i18n/index.ts`** — `t` for user-facing error strings.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` writes the failure audit entry.
- **`src/domain-primitives/time.ts`** — `MINUTE_MS` base unit for the two TTL constants.
- **`src/modules/account/services/index.ts`** — Re-exports the public API of this module for consumer convenience.
- **`src/modules/account/services/deletion-sign-in.ts`** — Consumes `MFA_CHALLENGE_TTL_MS` for the deletion-restore claim-check window (noted in the TTL doc comment).

## Notes

- The challenge is a **hashed, single-use token** (same mechanism as password-reset / deletion confirmation), not a JWT. A second presentation of a redeemed challenge is refused, not merely re-checked.
- TTL selection is **content-dependent**: any armed handler with `handler.delivers` true bumps the window from 5 min to 10 min. Do not hardcode a single TTL externally.
- `verifyLoginChallenge` intentionally omits a success audit record; the controller fires `AUTH_LOGIN` once a session actually exists. Adding one here would double-count.
- `redeemChallenge` is **not exported**. The `@internal` JSDoc on `buildLoginChallenge` notes it should stay out of the public `twoFactorService` surface — only the login controllers may mint sign-in challenges.
- A 401 response is used for both "challenge not found / expired" and "account has no 2FA enabled" to avoid leaking which condition triggered.
