---
source: tests/unit/infrastructure/adapters/antibot-providers/altcha.test.ts
sha256: aad6a2775d2f6a4aa62a4a3a7d5c66c54af02a528ed1b78c2141cbde71f51cd7
generated_at: 2026-09-27T16:02:39.896850+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/antibot-providers/altcha.test.ts

## Purpose

Unit tests for the self-hosted altcha anti-bot provider. They exercise the full browser-side flow — fetch a challenge, solve it with the library's own solver, submit the payload — plus the failure paths that matter most: replaying a solution and presenting a payload the server never signed.

## Key elements

- **`solvedPayload()`** — async helper that calls `altchaProvider.issueChallenge`, solves it via `altcha-lib`'s `solveChallenge` + `deriveKey`, and returns the base64-encoded `{ challenge, solution }` JSON string a widget would post back.
- **`beforeEach` / `afterEach`** — pins `NODE_ANTIBOT_ALTCHA_SECRET` to a known value and `NODE_ANTIBOT_ALTCHA_COST` to `500` (far below the production default of 100 000, so the solver stays fast). Restores the full `process.env` after every test so no ALTCHA variables leak into sibling suites.
- **`describe('the altcha provider')`** — seven cases covering:
  - `publicParameters` echoes the caller-supplied challenge URL rather than hard-coding one.
  - Issued challenges carry a signature, the configured cost, and the `PBKDF2/SHA-256` algorithm.
  - A correctly solved payload resolves to `'ok'`.
  - The same payload resolves to `'ok'` the first time and `'refused'` the second (replay protection).
  - Two *concurrent* verifications of the same payload yield exactly one `'ok'` and one `'refused'` (race-safe single-use).
  - A payload signed with a different secret resolves to `'refused'`.
  - A missing secret env var resolves to `'refused'` rather than throwing.

## Relationships

- **`src/infrastructure/adapters/antibot-providers/altcha.ts`** — the module under test; the file imports `altchaProvider` and drives every assertion through its `publicParameters`, `issueChallenge`, and `verify` members.
- **`src/infrastructure/security/versioned-secret.ts`** — indirect neighbor. The test controls the secret via the `NODE_ANTIBOT_ALTCHA_SECRET` env var, which the altcha provider reads through the versioned-secret mechanism; the "wrong secret" and "missing secret" cases exercise that indirection without importing `versioned-secret` directly.

## Notes

- Tests rely on `process.env` as the configuration surface (not DI), so the save/restore in `afterEach` is load-bearing — removing it causes secret leakage across test files.
- The concurrent-replay test uses `Promise.all` + `toSorted` to assert the *set* of outcomes without depending on which promise resolves first, keeping it stable across runtimes.
- `altcha-lib` is imported directly (both the root and the `algorithms/pbkdf2` sub-path) to mirror what a browser client would do; the test never fakes the solver.
