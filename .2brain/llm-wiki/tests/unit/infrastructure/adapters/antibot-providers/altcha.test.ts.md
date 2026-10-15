---
source: tests/unit/infrastructure/adapters/antibot-providers/altcha.test.ts
sha256: dd12b21d7adba8c0f99929fe1ed0fcc08ed03fefe7043032a08776e2999f9555
generated_at: 2026-10-15T13:04:28.628904+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/antibot-providers/altcha.test.ts

## Purpose

Exercises the self-hosted Altcha provider the way a browser widget would: issue a challenge, solve it with `altcha-lib`, and hand the base64 payload back to `verify`. Also pins down the two refusal paths that matter in production — a solution replayed a second time, and a payload signed by a different (or no) secret — plus the single-use store's lifecycle and TTL.

## Key elements

- **`solvedPayload()`** – async helper that issues a challenge via `altchaProvider.issueChallenge`, solves it with `solveChallenge` + `deriveKey` from `altcha-lib`, and returns the base64-encoded `{ challenge, solution }` string a browser would POST back.
- **`describe('the altcha provider')`** – suite covering:
  - `publicParameters` echoes the caller-supplied URL verbatim.
  - `issueChallenge` produces a signed challenge with the configured cost and `PBKDF2/SHA-256` algorithm.
  - `verify` accepts a genuine solution; refuses a second use of the same payload (including concurrent `Promise.all`); refuses a payload signed under a different secret; refuses (rather than throws) when the secret is missing; confirms a forged-signature attempt does **not** spend the challenge id; confirms an unsigned server payload leaves no record; refuses a payload with no `nonce` (id).
- **`describe('the single-use record')`** – suite covering `claim`/`isSpent` from `altcha-store`:
  - One-claim-then-spent lifecycle.
  - Over-long ids (≥ 257 chars) are treated as already spent and never claimable.
  - TTL expiry: a record older than 10 minutes is swept, verified with `jest.useFakeTimers`.

## Relationships

- **`src/infrastructure/adapters/antibot-providers/altcha.ts`** – the `altchaProvider` under test; every assertion in the first `describe` block calls its `publicParameters`, `issueChallenge`, and `verify`.
- **`src/infrastructure/adapters/antibot-providers/altcha-store.ts`** – `claim` and `isSpent` are exercised directly in the second `describe` block and indirectly through every `verify` call (replay, concurrency, and forged-signature tests all assert on the store's side-effects).
- **`tests/support/environment.ts`** – `setEnvironment` is used in `beforeEach` and in individual tests to swap `NODE_ANTIBOT_ALTCHA_SECRET` and `NODE_ANTIBOT_ALTCHA_COST`, simulating different deployment configurations without restarting the process.
- **`src/infrastructure/security/versioned-secret.ts`** – the `NODE_ANTIBOT_ALTCHA_SECRET` env var set here is the value the provider's signature verification resolves through; the "different secret" and "missing secret" tests exercise the refusal paths that depend on this lookup.

## Notes

- **Cost is deliberately tiny (500 vs. production's 100 000)** so the PBKDF2 solver finishes in milliseconds; the comment in `beforeEach` calls this out.
- **Ordering guarantee tested explicitly:** the "forged signature" and "unsigned payload" tests assert that the store is never touched before the signature check passes. If a future refactor claims the id first, these tests will catch it.
- **Concurrency test** (`Promise.all` of two identical `verify` calls) relies on the store's atomic claim; `verdicts.toSorted()` is used so the assertion is order-independent.
- **TTL test pins the clock** with `jest.useFakeTimers({ now: Date.now() })` so that records created by earlier tests in the same file don't appear "from the future" and get swept prematurely. The threshold is 10 minutes (the test ages a record by 11).
- **Over-long-id guard** (257-char string) is a DoS mitigation: the store rejects ids above its key-length limit rather than storing them.
