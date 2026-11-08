---
source: src/infrastructure/adapters/antibot-providers/altcha.ts
sha256: 50017cd9e2a41f9cf864d6108427aafce90c6327cbf4da8abe57dbfb1b161f94
generated_at: 2026-11-08T03:16:43.532483+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/altcha.ts

## Purpose

Self-hosted implementation of the `HumanChallengeProvider` port using the ALTCHA proof-of-work protocol. The server both issues and verifies challenges with no third-party scripts, no vendor dependency, and no outbound traffic — at the cost of CPU work landing on the visitor's device rather than a rented bot farm.

## Key elements

- **`altchaProvider`** (export) — The `HumanChallengeProvider` object (`name: 'altcha'`) that satisfies the port. Exposes `publicParameters` (returns `{ challengeUrl }`), `issueChallenge`, and `verify`.
- **`issue()`** — Calls `altcha-lib`'s `createChallenge` with the configured PBKDF2 cost, a 300 s TTL, and the dedicated signature secret. Returns an `IssuedChallenge` (parameters + signature).
- **`check(payload)`** — Verifies a base64 widget payload: extracts the challenge id, checks single-use via the store, calls `altcha-lib`'s `verify`, then claims the id only on success. Returns `'ok'` or `'refused'`.
- **`signatureSecret()`** — Reads `NODE_ANTIBOT_ALTCHA_SECRET` from `antibotConfig()`; throws if unset or shorter than `ALTCHA_SECRET_MIN_LENGTH`. Kept separate from the login secret so rotating one never invalidates the other.
- **`challengeIdOf(decoded)`** / **`payloadId(payload)`** — Parse a decoded payload (either `client` or `server` shape) to extract the single-use id. A local re-implementation because altcha-lib keeps its own reader private.
- **`ALGORITHM`** — `'PBKDF2/SHA-256'`, chosen for WebCrypto portability across Node, Bun, and Deno (Argon2id is not available everywhere).
- **`TTL_SECONDS`** — 300; how long a challenge remains solvable.

## Relationships

- **`antibot-providers/index.ts`** — Supplies the `HumanChallengeProvider` and `IssuedChallenge` types that this adapter implements/returns.
- **`antibot-store.ts`** — Provides `isSpent(id)` (read-only check) and `claim(id)` (atomic single-use record) used around `altcha-lib`'s `verify` to enforce one-use-per-challenge.
- **`antibot-verdict.ts`** — Source of the `RungVerdict` union type returned by `check()`.
- **`config.ts`** — Provides `antibotConfig()` (for cost and secret) and `ALTCHA_SECRET_MIN_LENGTH`.
- **`object-guards.ts`** — `isPlainObject` is used to safely narrow untrusted decoded payloads.
- **`altcha.test.ts`** — Unit tests for this adapter.

## Notes

- **Single-use is enforced locally, not by altcha-lib.** The store is *not* passed to `verify`; the adapter calls `isSpent` first, then `claim` only after a successful verify. This matters because altcha-lib records the id *before* checking the signature, which would burn a challenge on a forged payload.
- **`signatureSecret()` throws synchronously**, but it is invoked *inside* a `.then` chain in `check` so the error is caught by the outer `.catch(() => 'refused')` on the provider's `verify` method — a misconfigured deployment returns `'refused'` rather than a 500.
- **`payloadId` swallows all parse errors** (`atob`, `JSON.parse`) into `undefined`, which maps to an immediate `'refused'`. The eslint-disable for `no-restricted-syntax` is intentional: there is no non-throwing alternative.
- **`publicParameters` takes `challengeUrl` as an argument** rather than hard-coding it; the caller (`modules/antibot` controller) decides the endpoint.
- **PBKDF2 over Argon2id** is a deliberate portability trade-off documented in the source; do not "upgrade" to Argon2 without checking the target runtimes.
