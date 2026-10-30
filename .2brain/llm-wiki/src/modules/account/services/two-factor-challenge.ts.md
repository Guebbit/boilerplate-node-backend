---
source: src/modules/account/services/two-factor-challenge.ts
sha256: e50a1c01a2cc1c89d6978780f5f0c423a5fa11c52b0daee5fe4b37db746bc296
generated_at: 2026-10-29T02:45:46.172205+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/two-factor-challenge.ts

## Purpose

Implements the second step of a two-factor login: building an MFA challenge, delivering a code against it, and verifying a submitted code. Deliberately stops short of minting a session — that hand-off is the controller's job (`post-login-2fa.ts`).

## Key elements

- **`MFA_CHALLENGE_TTL_MS`** (300 000 ms) — Lifetime for a challenge where every armed factor is read off a device. Also reused by the deletion-restore claim check.
- **`MFA_CHALLENGE_DELIVERED_TTL_MS`** (600 000 ms) — Lifetime when at least one armed factor is delivered (e.g. email). Also referenced by the rate-limit windowing.
- **`buildLoginChallenge(user, amr)`** — Assembles the `{ mfaRequired, challenge, expiresAt, methods, defaultMethod }` body returned by `POST /account/login`. Chooses TTL based on whether any armed factor delivers a code. Issues the challenge token via `issueToken`.
- **`sendLoginCode(challenge, method, context)`** — Handles `POST /account/login/2fa/send`. Looks up the live challenge, delegates to `deliverArmedCode`, and wraps the result in an audit trail. Public endpoint (unauthenticated), so cooldown is enforced here.
- **`VerifiedChallenge`** — Interface: `{ user, amr }` returned on successful verification, consumed by the controller to mint the session.
- **`verifyLoginChallenge(challenge, code, context)`** — Handles `POST /account/login/2fa`. Looks up the challenge entry, calls `verifyArmedFactor` → `settleVerdict`, then **spends** the token (`spendLiveToken`) before persisting the user. Only the request whose own write removed the token may proceed; concurrent twins are rejected. Audits **failures** only.

## Relationships

- **`./tokens.ts`** — Provides `issueToken`, `findLiveToken`, `findLiveTokenEntry`, `spendLiveToken`; the sole mechanism for challenge persistence and one-shot spending.
- **`./two-factor-outcomes.ts`** — Provides `armedEntries`, `summarize`, `deliverArmedCode`, `audited`; abstracts which methods are armed and how codes are delivered.
- **`./two-factor-lockout.ts`** — Provides `verifyArmedFactor` (code check + lockout) and `settleVerdict` (decide spend-vs-leave-live).
- **`./token-types.ts`** — Supplies the `MFA_CHALLENGE_TOKEN_TYPE` discriminator for all token lookups.
- **`../audit.ts`** — Supplies `accountAuditActions` enum values (`AUTH_2FA_CODE_SENT`, `AUTH_2FA_CHALLENGE_FAILED`).
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape every return value.
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope` converts unexpected throws into a standard error envelope.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the failure audit row.
- **`@infrastructure/i18n`** — `t()` supplies user-facing error message keys.
- **`../services/index.ts`** — Barrel that re-exports this module's public API.
- **`../services/deletion-sign-in.ts`** — Imports `MFA_CHALLENGE_TTL_MS` for its restore-claim window.

## Notes

- **No session is minted here.** A successful `verifyLoginChallenge` returns the user + AMR but does not set cookies. The controller (`post-login-2fa.ts`) fires `AUTH_LOGIN` and mints the session. Auditing success in this file would falsely claim a login occurred.
- **Single-use guarantee.** The challenge token is spent via `spendLiveToken` in a write path; a concurrent duplicate request will see `spentByThisRequest === false` and receive a 401 identical to a missing challenge.
- **AMR is stored on the token entry, not derived.** A challenge without an `amr` array (e.g. legacy data) is rejected rather than defaulted to `['pwd']`.
- **`sendLoginCode` is unauthenticated.** The route-level limiter is a backstop, not the primary guard — the cooldown logic lives in this function because anyone can call the endpoint.
- **TTL choice is per-challenge**, not per-method: if *any* armed factor delivers a code, the full 600 s window applies to the entire challenge.
