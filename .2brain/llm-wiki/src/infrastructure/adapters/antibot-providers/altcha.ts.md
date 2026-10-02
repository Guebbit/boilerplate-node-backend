---
source: src/infrastructure/adapters/antibot-providers/altcha.ts
sha256: a974c881bf628820c3312664f72ccfae6e547428bda0ed92902b8a1aeecaa42e
generated_at: 2026-10-01T12:46:10.709175+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/altcha.ts

## Purpose

Adapter that implements the `HumanChallengeProvider` port using ALTCHA, a self-hosted proof-of-work human-challenge. The server itself issues and verifies challenges — no third-party script, no external API calls. Selected over Turnstile when zero-vendor, zero-egress is the priority; the trade-off is that the computational cost lands on the visitor's device.

## Key elements

- **`altchaProvider`** (exported) — the `HumanChallengeProvider` object with `name: 'altcha'`, `publicParameters(challengeUrl)`, `issueChallenge`, and `verify`. This is what the antibot module receives and dispatches to.
- **`issue()`** — calls `altcha-lib`'s `createChallenge` with the configured cost, PBKDF2/SHA-256, a 300 s expiry, and the HMAC signing secret. Returns `{ parameters, signature }`.
- **`check(payload)`** — calls `altcha-lib`'s `verify` (signature, expiry, work, single-use via store) and maps the result to `'ok' | 'refused'`.
- **`signatureSecret()`** — reads `NODE_ANTIBOT_ALTCHA_SECRET` from config; throws if missing or < 16 chars. Kept as a separate function so the throw can be deferred into the Promise chain.
- **`ALGORITHM`** — hardcoded to `'PBKDF2/SHA-256'` (WebCrypto-portable; Argon2id not viable on Bun/Denol/older Node).
- **`TTL_SECONDS`** — 300 s challenge lifetime.

## Relationships

- **`antibot-providers/index.ts`** — supplies the `HumanChallengeProvider` and `IssuedChallenge` type contracts this adapter fulfills.
- **`antibot-verdict.ts`** — supplies the `RungVerdict` union type (`'ok' | 'refused'`) returned from `check` / `verify`.
- **`altcha-store.ts`** — provides `altchaStore`, the single-use store passed to `altcha-lib`'s `verify` so a consumed challenge cannot be replayed.
- **`config.ts`** — `antibotConfig()` is the source for `NODE_ANTIBOT_ALTCHA_SECRET` and `NODE_ANTIBOT_ALTCHA_COST`.
- **`tests/…/altcha.test.ts`** — unit tests covering issue/verify paths and the secret-missing error.

## Notes

- **Synchronous-throw guard:** `signatureSecret()` is intentionally called *inside* `Promise.resolve().then(…)` in `check`, not as a direct argument to `verify`. If it threw synchronously it would escape the outer `.catch(() => 'refused')` and surface as a 500 instead of a clean refusal.
- **`publicParameters`** takes a `challengeUrl` argument supplied by the calling controller (`modules/antibot`); the URL is never hardcoded in this adapter.
- **Algorithm choice is deliberate:** PBKDF2 was picked over Argon2id for cross-runtime portability (Bun, Deno, Node < 24.7). Changing it is a breaking change for already-issued in-flight challenges.
- **Cost is a deployment dial:** `NODE_ANTIBOT_ALTCHA_COST` controls iteration count; raising it taxes bots and honest mobile users alike.
