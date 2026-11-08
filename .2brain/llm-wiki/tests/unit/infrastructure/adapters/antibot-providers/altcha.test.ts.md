---
source: tests/unit/infrastructure/adapters/antibot-providers/altcha.test.ts
sha256: dd12b21d7adba8c0f99929fe1ed0fcc08ed03fefe7043032a08776e2999f9555
generated_at: 2026-11-08T10:05:13.782394+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/antibot-providers/altcha.test.ts

## Purpose

Unit tests for the self-hosted Altcha anti-bot provider and its single-use store. Simulates the full browser round-trip (issue → solve → verify) plus the critical refusal paths: double-spend, wrong signature, missing signature, missing nonce, and missing secret.

## Key elements

- **`solvedPayload()`** (local helper) — calls `altchaProvider.issueChallenge`, solves it with `altcha-lib`'s `solveChallenge` + `deriveKey`, and returns the base64 widget payload. Every provider test reuses this to get a realistic input.
- **`describe('the altcha provider')`** — 9 tests covering:
  - `publicParameters` echoes the caller-supplied challenge URL.
  - Issued challenge carries a signature, configured cost (500), and `PBKDF2/SHA-256` algorithm.
  - Happy-path verification returns `'ok'`.
  - Re-submission of the same payload returns `'refused'` (double-spend).
  - Concurrent submission of the same payload: one `'ok'`, one `'refused'`.
  - A payload signed with a *different* secret is refused.
  - Missing secret → `'refused'` (no throw).
  - A forged signature does **not** mark the challenge id as spent (signature checked before claim).
  - An unsigned server payload is refused and does not pollute the store.
  - A payload with no `nonce` (challenge id) is refused.
- **`describe('the single-use record')`** — 3 tests for `altcha-store`:
  - `claim`/`isSpent` lifecycle: claim once → spent; second claim returns `false`.
  - Over-long ids (> 256 chars) are treated as already spent and never claimable.
  - TTL sweep: a record older than 10 minutes expires (fake timers), newer one persists.

## Relationships

- **`src/infrastructure/adapters/antibot-providers/altcha.ts`** — the system under test; `altchaProvider` (with `publicParameters`, `issueChallenge`, `verify`) is the primary object under assertion.
- **`src/infrastructure/adapters/antibot-providers/altcha-store.ts`** — `claim` and `isSpent` are tested directly in the second `describe` block and indirectly through double-spend / concurrency tests.
- **`tests/support/environment.ts`** — `setEnvironment` is called in `beforeEach` and inside individual tests to swap `NODE_ANTIBOT_ALTCHA_SECRET` and `NODE_ANTIBOT_ALTCHA_COST` between cases.

## Notes

- Cost is set to **500** in tests (vs. 100 000 in production) so the `altcha-lib` solver stays fast; this is a deliberate test-only override, not a default.
- The "records nothing for a wrong signature" test exists to guard a specific ordering: the store must not `claim` before the signature is validated, or a forged request could burn a legitimate challenge id.
- The TTL test uses `jest.useFakeTimers` with a `try/finally` to restore real timers; the 10-minute threshold is the store's expiry window.
- `setEnvironment` in `beforeEach` calls are sequential (two calls per reset), not a single merged object — each call overwrites the full environment snapshot.
