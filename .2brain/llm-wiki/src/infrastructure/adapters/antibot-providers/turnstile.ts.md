---
source: src/infrastructure/adapters/antibot-providers/turnstile.ts
sha256: 45271679d107acaf326533561178467e718576fcbc64f5261fb7416472a4c16f
generated_at: 2026-09-27T14:04:32.833937+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/turnstile.ts

## Purpose

Reference (not recommended) implementation of the `HumanChallengeProvider` port using Cloudflare Turnstile. Server-side, it exchanges a client-submitted token for a binary verdict (`ok` / `refused`) by calling Cloudflare's siteverify endpoint. The file is deliberately shipped as a worked example to illustrate the port's contract; deployments choosing it accept a third-party script and its data-protection implications.

## Key elements

- **`VERIFY_URL`** – Hard-coded Cloudflare siteverify endpoint (`challenges.cloudflare.com/.../siteverify`).
- **`VERIFY_TIMEOUT_MS`** – 5 000 ms; enforces the cap via `AbortSignal.timeout` so a slow upstream never holds a signup flow open.
- **`secretKey()`** – Reads `NODE_ANTIBOT_TURNSTILE_SECRET` from `process.env` on every call (supports key rotation without restart). Throws if the variable is absent or empty, enforcing a fail-closed posture.
- **`siteverify(token, remoteAddress?)`** – POSTs `secret`, `response` (token), and optional `remoteip` as form-encoded body. Maps any non-200 response, timeout, or body lacking `success: true` to `'refused'`.
- **`turnstileProvider`** (export) – The `HumanChallengeProvider` object.
  - `name`: `'turnstile'`.
  - `publicParameters()`: returns the site key (`NODE_ANTIBOT_TURNSTILE_SITE_KEY`) and the Turnstile JS `scriptUrl` for client-side embedding.
  - `verify(token, remoteAddress)`: delegates to `siteverify`, with a top-level `.catch(() => 'refused')` as a final safety net.

## Relationships

- **`./index`** (`antibot-providers/index.ts`) – Imports the `HumanChallengeProvider` type that `turnstileProvider` satisfies.
- **`../antibot-verdict.ts`** (`antibot-verdict.ts`) – Imports the `RungVerdict` type (`'ok' | 'refused'`) used as the return type of `siteverify` and `verify`.

## Notes

- The module doc comment explicitly frames this as a *worked example*, not a recommendation. `docs/modules/antibot.md` lists alternatives and their trade-offs.
- All failure modes (missing secret, network error, non-200, malformed JSON, timeout) resolve to `'refused'`—the provider never produces a false positive.
- `remoteip` is sent only when a value is actually provided; its absence degrades scoring accuracy but does not change the pass/fail logic.
- `secretKey()` is called inside the `fetch` argument construction, so a missing secret throws *before* the request is issued; the outer `.catch(() => 'refused')` on `turnstileProvider.verify` is intended as the final backstop.
