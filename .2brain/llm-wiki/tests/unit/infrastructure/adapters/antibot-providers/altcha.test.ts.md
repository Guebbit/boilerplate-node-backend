---
source: tests/unit/infrastructure/adapters/antibot-providers/altcha.test.ts
sha256: 6da0844b51c66040bac6e6c2ff0af3339e93ffff490b5c18de317f5ea45fa80c
generated_at: 2026-09-23T20:16:03.851172+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/antibot-providers/altcha.test.ts

## Purpose

Unit tests for the self-hosted ALTCHA anti-bot provider. Exercises the full browser-equivalent flow (issue challenge → solve with the library's own solver → verify payload) and pins down the two critical refusal paths: replay of an already-consumed solution and verification against a mismatched or absent signing secret.

## Key elements

- **`solvedPayload()`** — async helper that calls `altchaProvider.issueChallenge`, solves it via `altcha-lib`'s `solveChallenge` + `deriveKey`, and returns the base64-encoded `{challenge, solution}` blob a browser widget would post back.
- **`beforeEach` / `afterEach`** — sets `NODE_ANTIBOT_ALTCHA_SECRET` and `NODE_ANTIBOT_ALTCHA_COST=500` (low cost for test speed); restores the entire `process.env` from a snapshot taken at module load.
- **"echoes back whatever challenge url…"** — asserts `publicParameters` returns the caller-supplied path verbatim rather than a hardcoded URL.
- **"issues a signed challenge…"** — asserts the challenge has a non-empty `signature`, `parameters.cost === 500`, and `parameters.algorithm === 'PBKDF2/SHA-256'`.
- **"accepts a genuinely solved challenge"** — round-trip: issued challenge is solved and verifies as `'ok'`.
- **"refuses the same solution a second time"** — verifies the same payload twice; second call must resolve to `'refused'`.
- **"refuses a payload this server never signed"** — swaps the secret after issuing/solving; verification must yield `'refused'`.
- **"refuses rather than throwing when the secret is missing"** — deletes the secret env var entirely; `verify` resolves to `'refused'` instead of throwing.

## Relationships

- **`src/infrastructure/adapters/antibot-providers/altcha.ts`** — the system under test. The test imports `altchaProvider` and exercises its `publicParameters`, `issueChallenge`, and `verify` methods directly.
- **`src/infrastructure/security/versioned-secret.ts`** — indirect dependency: `altcha.ts` uses it for signing/verification. The test touches it only through environment-variable-driven configuration (`NODE_ANTIBOT_ALTCHA_SECRET`); no direct import.

## Notes

- The test intentionally uses a very low ALTCHA cost (500 vs. production 100 000) so `solveChallenge` completes quickly; the assertion still checks the configured cost value round-trips correctly.
- `process.env` is snapshotted **once** at module scope (`ORIGINAL`) and restored after **every** test, so the "missing secret" case (which `delete`s the variable) cannot leak into subsequent tests.
- All verification assertions use `resolves.toBe(...)` rather than `rejects`, encoding the contract that the provider signals failure via a string return value, not an exception.
