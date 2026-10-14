---
source: src/infrastructure/adapters/antibot-providers/turnstile.ts
sha256: 2e6da83d93d0fa2bd842dda02135c0df67c7cb852554977953da0952ce5d2a3f
generated_at: 2026-10-14T07:41:34.173821+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/turnstile.ts

## Purpose

Concrete implementation of the `HumanChallengeProvider` port using Cloudflare Turnstile. It verifies a client-submitted token server-side by calling Cloudflare's `/siteverify` endpoint and maps the result to a `RungVerdict`. Shipped as a reference implementation (not an endorsement) for deployments that choose Turnstile over the alternatives documented in `docs/modules/antibot.md`.

## Key elements

- **`turnstileProvider`** (export) — The `HumanChallengeProvider` object. Exposes:
  - `name: 'turnstile'`
  - `publicParameters()` — Returns the site key (from config) and the Turnstile script URL for the frontend to load.
  - `verify(token, remoteAddress?)` — Calls `siteverify`; any thrown error is caught and mapped to `'refused'`.
- **`secretKey()`** (private) — Reads `NODE_ANTIBOT_TURNSTILE_SECRET` from config on every call (no caching, so rotation needs no restart). **Throws** if the provider is selected without a secret — failing closed.
- **`siteverify(token, remoteAddress?)`** (private) — POSTs form-encoded `secret`, `response` (token), and optional `remoteip` to Cloudflare. 5 s abort timeout, `redirect: 'error'`. Parses the body via `readCappedJson`; only an explicit `success === true` yields `'ok'` — everything else (non-200, timeout, malformed JSON, missing field) yields `'refused'`.
- **`VERIFY_URL`**, **`VERIFY_TIMEOUT_MS`** — Module-level constants for the endpoint and timeout.

## Relationships

- **`./index`** — Imports the `HumanChallengeProvider` type; this file provides one of its implementations.
- **`../antibot-verdict`** — Imports the `RungVerdict` type that `verify` resolves to.
- **`@infrastructure/adapters/config`** — Calls `antibotConfig()` to obtain `NODE_ANTIBOT_TURNSTILE_SITE_KEY` and `NODE_ANTIBOT_TURNSTILE_SECRET`.
- **`@infrastructure/http/read-capped-body`** — Uses `readCappedJson` and `DEFAULT_BODY_CAP_BYTES` to parse the Cloudflare response body with a size guard.

## Notes

- **Fail-closed by design.** A missing secret throws (crashing the request path), not a permissive default. A network error, timeout, redirect, non-200, or malformed body all collapse to `'refused'`, never `'ok'`.
- **No token storage or session state.** Verification is a single stateless HTTP call; the provider keeps no client data.
- **`remoteip` is optional.** Omitting it does not fail verification; Cloudflare simply has less signal for scoring.
- **The secret is read per request** (`secretKey()` is called inside `siteverify`), so rotating `NODE_ANTIBOT_TURNSTILE_SECRET` in the environment takes effect immediately without a process restart.
