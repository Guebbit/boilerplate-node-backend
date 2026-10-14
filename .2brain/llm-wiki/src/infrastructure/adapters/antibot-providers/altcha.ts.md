---
source: src/infrastructure/adapters/antibot-providers/altcha.ts
sha256: 50017cd9e2a41f9cf864d6108427aafce90c6327cbf4da8abe57dbfb1b161f94
generated_at: 2026-10-14T07:40:55.373182+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/altcha.ts

## Purpose

Implements the self-hosted `HumanChallengeProvider` port using ALTCHA, a proof-of-work challenge the server both issues and verifies. Chosen over vendor-backed options (e.g. Turnstile) to eliminate third-party scripts and outbound traffic; the trade-off is that the CPU work lands on the visitor's device.

## Key elements

- **`altchaProvider`** — the exported `HumanChallengeProvider` object (`name`, `publicParameters`, `issueChallenge`, `verify`). The only public export of this module.
- **`ALGORITHM`** — fixed to `'PBKDF2/SHA-256'`; chosen for WebCrypto portability across Node, Bun, and Deno (Argon2id is native-only on Node ≥ 24.7).
- **`TTL_SECONDS`** — 300 s; controls the `expiresAt` stamped on every issued challenge.
- **`signatureSecret()`** — reads `NODE_ANTIBOT_ALTCHA_SECRET` from `antibotConfig()`; throws if the value is missing or shorter than `ALTCHA_SECRET_MIN_LENGTH`. Kept separate from the login secret so rotating one never invalidates in-flight challenges.
- **`issue()`** — wraps `altcha-lib`'s `createChallenge`, passing the config's `cost`, the derived-key function, the TTL, and the signature secret. Returns an `IssuedChallenge` (`parameters` + `signature`).
- **`challengeIdOf(decoded)`** — extracts the single-use id from a decoded payload. Handles both `client` (via `challenge.parameters.data.challengeId` or `nonce`) and `server` (via `id`) payload shapes. Hand-rolled copy of altcha-lib's private reader.
- **`payloadId(payload)`** — base64-decodes and JSON-parses the widget's payload, then delegates to `challengeIdOf`. Returns `undefined` for any undecodable input.
- **`check(payload)`** — full verification pipeline: extract id → read-only `isSpent` → `altcha-lib` `verify` (signature, expiry, PoW) → `claim` id. Returns `'ok'` or `'refused'`.

## Relationships

- **`altcha-store.ts`** — provides `claim(id)` and `isSpent(id)` for the single-use gate around verification.
- **`index.ts`** — source of the `HumanChallengeProvider` and `IssuedChallenge` types this module implements/returns.
- **`antibot-verdict.ts`** — source of the `RungVerdict` type (`'ok' | 'refused'`) returned by `check`.
- **`config.ts`** — `antibotConfig()` supplies `NODE_ANTIBOT_ALTCHA_SECRET`, `NODE_ANTIBOT_ALTCHA_COST`; `ALTCHA_SECRET_MIN_LENGTH` is the validation threshold.
- **`object-guards.ts`** — `isPlainObject` used to safely inspect untrusted decoded payloads before property access.
- **`altcha.test.ts`** — unit tests covering issue, verify, single-use, and malformed-payload paths.

## Notes

- **Single-use ordering is deliberate.** `altcha-lib`'s `verify` records the id *before* checking the signature, which would burn a single-use slot on a forged payload. This module calls the read-only `isSpent` first, runs `verify` without handing it a store, and only calls `claim` after a successful verification.
- **`signatureSecret()` throws synchronously**, but is invoked *inside* the promise chain in `check` so that `altchaProvider.verify`'s `.catch(() => 'refused')` converts a misconfigured deployment into a clean refusal rather than an unhandled synchronous throw / HTTP 500.
- **No public key in `publicParameters`.** The ALTCHA widget only needs the challenge-fetch URL; the URL is supplied by the caller (`modules/antibot` controller), never hard-coded here.
- **`challengeIdOf` is a maintenance hazard.** It mirrors altcha-lib's internal id reader, which is not a public API. If altcha-lib changes its payload shape, this copy must be updated in lockstep (see the linked source).
