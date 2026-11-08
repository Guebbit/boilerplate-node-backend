---
source: tests/integration/journeys/an-accounts-whole-security-life.test.ts
sha256: 8ff6cc5209f1f50b850da1354a7c2185803001b70740a57c257561f30ac7ab71
generated_at: 2026-11-08T09:39:43.268324+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/journeys/an-accounts-whole-security-life.test.ts

## Purpose

A single end-to-end journey test that walks one account through its entire security lifecycle: signup behind a human check, email verification, TOTP enrollment, API-key minting, password reset (which revokes all sessions and keys), step-up re-auth for an email change, the 7-day undo window, and the 7-day data-export retention window. It exists to prove that every security invariant—session invalidation, credential revocation, link expiry, and audit completeness—holds when the clock only moves forward.

## Key elements

- **`signIn(email, password, code)`** — Private helper. Performs a two-step login (password → TOTP), extracts the `__Host-session` cookie, and returns the response plus cookie for one-time bearer conversion via `bearerForCookie`.
- **`ACCOUNT`** — Constant holding the test identity: original email, username, two passwords, and the target email for the change journey.
- **`DAY_MS`** — `86_400_000`; used to compute expiry offsets (7-day API-key TTL, 7-day undo window, 7-day export retention).
- **`it('keeps the account safe from signup to the last lapsed link')`** — The sole test. Sequentially exercises: altcha-gated signup → email-verify → TOTP arm (which kills the session) → API-key mint → password reset (kills session + key, sends revocation mail) → frozen-clock step-up re-auth → email change + confirm → undo-link 422 after 8 days → `reap:previous-emails` job → export request/settle/fetch → export 404 after 8 days → `reap:account-exports` job → audit-trail and mail assertions.
- **`beforeEach`** — Activates the outbox mail sink and the altcha solver.
- **`afterEach`** — Restores real timers (the test freezes the clock mid-journey).

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` runs once at module load to provision an isolated database.
- **`tests/support/contract.ts`** — Side-effect import; registers API-contract guards for every `api()` call.
- **`tests/support/http.ts`** — Provides `api()` (supertest wrapper), `bearerForCookie` (cookie → bearer, single-use refresh), and `loginBearer` (convenience for the pre-2FA token used during TOTP setup).
- **`tests/support/altcha.ts`** — `useAltcha()` enables the challenge solver; `solvedChallenge()` produces the header for signup and password-reset requests.
- **`tests/support/cookies.ts`** — `setCookie` extracts the `__Host-session` cookie from the login response.
- **`tests/support/clock.ts`** — `freezeDate()` / `advanceDate()` simulate time passing so TOTP steps advance and TTL windows elapse deterministically.
- **`tests/support/totp.ts`** — `codeFor(secret, step)` computes the TOTP code for a given 30-second step, letting the test sign in with the "next" code after each clock advance.
- **`tests/support/journey-mail.ts`** — `useOutboxMail()` captures mail; `waitForMail` blocks until a specific template arrives; `mailsTo` inspects all messages to an address.
- **`tests/support/drain.ts`** — `runJob('reap:previous-emails')` and `runJob('reap:account-exports')` trigger the maintenance sweeps and assert their effects.
- **`tests/support/body-of.ts`** — `bodyOf(response, Schema)` parses a response body against a Zod schema for typed assertions on the audit list.
- **`src/modules/account/services/export.ts`** — `settleInlineExports()` forces pending export jobs to complete synchronously so the test can fetch the file immediately.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` is the tenant ID passed to `seedMembership` to make the account a tenant admin (required before minting an API key).
- **`src/modules/access/tests/factories.ts`** — `seedMembership` inserts the admin role row so the account can hold a machine credential.

## Notes

- **TOTP step discipline.** Each `codeFor(secret, n)` call refers to a 30-second window. After `advanceDate(60_000)` the next code must use step `0` of the *new* window, not a continuation of the old sequence. The test is written so every sign-in uses a step the account has not consumed yet; using a repeated step will cause a 401.
- **Bearer vs. cookie sessions.** After re-auth the response may carry a `token` (JWT) or a `sessionToken` (cookie-based session ID). The test normalises both into a single `Bearer` header. Mixing the two (e.g., sending a raw `sessionToken` without the `Bearer` prefix) will fail.
- **Arming TOTP kills the session that performed it.** The test asserts a 401 on the pre-arm token immediately after `confirm`, then signs in fresh. Forgetting this step causes every subsequent call to 401.
- **`settleInlineExports` is a production import**, not a test mock. It forces the export pipeline to run synchronously so the test does not need to poll.
- **Audit assertion uses `arrayContaining`, not exact equality.** The audit log may contain entries the test does not explicitly check; only the listed actions are required to be present.
- **Clock is frozen for the second half.** All time advances after `freezeDate()` are relative to the frozen point. `advanceDate` calls accumulate; the test never calls `restoreDate` except via the `afterEach` `jest.useRealTimers()`.
