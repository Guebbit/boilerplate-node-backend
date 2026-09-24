---
source: src/infrastructure/adapters/antibot-providers/altcha.ts
sha256: f2a21150b6fbe85600a2c351af6e13b766cd578aca2f7d3599c391a1580c31a2
generated_at: 2026-09-23T17:37:20.388750+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/altcha.ts

## Purpose

Implements the self-hosted ALTCHA proof-of-work human-challenge provider. The server both issues and verifies challenges locally—no vendor script, no outbound traffic—making it the privacy-preserving alternative to Turnstile. The trade-off is that the proof-of-work runs on the visitor's device, which is heavier on a phone than on a rented bot server.

## Key elements

- **`altchaProvider`** (exported) — The `HumanChallengeProvider` object with `name`, `publicParameters`, `issueChallenge`, and `verify`. This is the single public surface.
- **`issue()`** — Calls `altcha-lib` `createChallenge` with the configured algorithm, cost, TTL, and HMAC secret; returns an `AntibotChallenge` (`parameters` + `signature`).
- **`check(payload)`** — Calls `altcha-lib` `verify` with `deriveKey`, the signature secret, and `altchaStore` (for single-use tracking); maps the result to `'ok'` or `'refused'`.
- **`signatureSecret()`** — Reads `NODE_ANTIBOT_ALTCHA_SECRET` (≥ 16 chars); throws if unset or too short so an unsigned challenge can never be minted.
- **`cost()`** — Reads `NODE_ANTIBOT_ALTCHA_COST` via `environmentNumber`, defaulting to 100 000 iterations, minimum 1.
- **`ALGORITHM`** — `'PBKDF2/SHA-256'`, chosen for universal WebCrypto support (unlike Argon2id, which needs Node 24.7+ and is absent on Bun/Deno).
- **`TTL_SECONDS`** — 300 s validity window for a challenge.

## Relationships

- **`./altcha-store.ts`** — Supplies `altchaStore`, passed to `altcha-lib` `verify` to enforce single-use of a challenge.
- **`./index.ts`** — Defines the `HumanChallengeProvider` interface that `altchaProvider` satisfies.
- **`../antibot-verdict.ts`** — Exports the `RungVerdict` type (`'ok' | 'refused'`) used as the return type of `check` and `verify`.
- **`@infrastructure/runtime/environment`** — Provides `environmentNumber` for reading `NODE_ANTIBOT_ALTCHA_COST` with a floor.
- **`@types`** — Exports the `AntibotChallenge` shape returned by `issue()`.
- **`tests/unit/infrastructure/adapters/antibot-providers/altcha.test.ts`** — Unit tests for this module.

## Notes

- `signatureSecret()` is intentionally called **inside** `Promise.resolve().then(…)` in `check`. A synchronous throw at argument-evaluation time would escape the `.catch(() => 'refused')` wrapper and surface as an unhandled 500; deferring it into the chain lets the catch convert a misconfigured deployment into a clean `'refused'`.
- `cost` enforces `min: 1`. A cost of 0 is not "easier"—it is no challenge at all.
- `publicParameters` receives `challengeUrl` from its caller (the antibot module's controller) rather than hard-coding it, keeping the adapter transport-agnostic.
- The HMAC secret is independent of any login/session secret; rotating one does not invalidate the other.
