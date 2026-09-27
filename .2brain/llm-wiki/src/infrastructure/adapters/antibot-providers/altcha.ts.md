---
source: src/infrastructure/adapters/antibot-providers/altcha.ts
sha256: a34cf04e54ba42362962d4427a12f8d0532ee3615871e0280ff64ff6867dfdd8
generated_at: 2026-09-27T14:04:15.381911+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/altcha.ts

## Purpose

Self-hosted proof-of-work anti-bot provider implementing the `HumanChallengeProvider` port. The server both issues and verifies ALTCHA challenges locally via `altcha-lib`—no vendor script, no third-party network call. Chosen as the zero-egress alternative to Turnstile, accepting that the CPU cost lands on the visitor's device.

## Key elements

- **`altchaProvider`** (exported) — the `HumanChallengeProvider` object wired into the antibot pipeline. Exposes `name`, `publicParameters(challengeUrl)`, `issueChallenge`, and `verify`.
- **`issue()`** — calls `createChallenge` from `altcha-lib` with the configured algorithm, cost, expiry, and HMAC secret; returns an `AntibotChallenge` (`parameters` + `signature`).
- **`check(payload)`** — calls `verify` from `altcha-lib` using `deriveKey` (PBKDF2) and `altchaStore` for single-use enforcement; maps the result to a `RungVerdict` (`'ok'` or `'refused'`).
- **`signatureSecret()`** — reads `NODE_ANTIBOT_ALTCHA_SECRET`; throws if missing or < 16 chars. Deliberately independent of any login secret so key rotation doesn't invalidate in-flight challenges.
- **`cost()`** — reads `NODE_ANTIBOT_ALTCHA_COST` via `environmentNumber`, defaulting to 100 000 iterations, min 1.
- **Constants** — `ALGORITHM` (`PBKDF2/SHA-256`), `DEFAULT_COST` (100 000), `TTL_SECONDS` (300).

## Relationships

- **`antibot-store.ts`** — exports `altchaStore`, passed as the single-use store into `verify()` so each solution token can be redeemed exactly once.
- **`index.ts`** (antibot-providers) — defines the `HumanChallengeProvider` interface that `altchaProvider` satisfies.
- **`antibot-verdict.ts`** — defines the `RungVerdict` type returned by `check()`.
- **`environment.ts`** — supplies `environmentNumber` used to read the cost configuration from the environment.
- **`@types` (src/types/index.ts)** — provides the `AntibotChallenge` shape returned by `issue()`.
- **`altcha.test.ts`** — unit tests covering challenge issuance, verification, single-use rejection, and the secret-missing error path.

## Notes

- **PBKDF2 over Argon2id**: chosen for WebCrypto portability—Argon2id is native only on Node ≥ 24.7 and unavailable on Bun/Deno.
- **`Promise.resolve().then(…)` in `check`**: deliberate. `signatureSecret()` throws synchronously; wrapping it inside the promise chain ensures the error is caught by `.catch(() => 'refused')` rather than escaping as an unhandled 500.
- **`publicParameters(challengeUrl)`**: the URL is injected by the caller (the antibot controller), never hard-coded here. The widget needs no secret key—only the challenge endpoint.
- **`min: 1` on cost**: a value of 0 would mean no work at all, defeating the purpose; the guard enforces at least one iteration.
