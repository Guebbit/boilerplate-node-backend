---
source: src/infrastructure/adapters/antibot-providers/turnstile.ts
sha256: ae3224b58ca74a3d1c952f446e08d05003196fb6374d6ae02efa088dfcc2e7e4
generated_at: 2026-09-23T17:37:47.396930+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/turnstile.ts

## Purpose

A reference implementation of the `HumanChallengeProvider` port using Cloudflare Turnstile. It exists to demonstrate the contract (public parameters out, token verified server-side) for teams choosing a human-challenge approach; the module docs explicitly note it is a worked example, not a recommendation, and that selecting it means loading a third-party script and its data-protection implications.

## Key elements

- **`turnstileProvider: HumanChallengeProvider`** (export) — the adapter object. `name` is `"turnstile"`; `publicParameters()` returns the `siteKey` env var and the Turnstile `api.js` URL for the client to load; `verify(token, remoteAddress?)` calls Cloudflare siteverify and always resolves to a `RungVerdict`.
- **`siteverify(token, remoteAddress?)`** (internal) — POSTs `secret`, `response`, and optionally `remoteip` to the Cloudflare endpoint. Resolves to `'ok'` only when the JSON body has `success === true`; every other shape (non-200, timeout, malformed body) resolves to `'refused'`.
- **`secretKey()`** (internal) — reads `NODE_ANTIBOT_TURNSTILE_SECRET` from the environment on every call (no caching, so rotation needs no restart). Throws if the value is empty, preventing a misconfiguration where every caller would pass.
- **`VERIFY_URL` / `VERIFY_TIMEOUT_MS`** (internal constants) — the Cloudflare endpoint and a 5-second abort window.

## Relationships

- **`src/infrastructure/adapters/antibot-providers/index.ts`** — defines the `HumanChallengeProvider` interface that `turnstileProvider` implements. The adapter is expected to be selected via that index based on `NODE_ANTIBOT_PROVIDER`.
- **`src/infrastructure/adapters/antibot-verdict.ts`** — supplies the `RungVerdict` type (`'ok' | 'refused'`) that `siteverify` and the provider's `verify` return.

## Notes

- **Fails closed everywhere.** A missing secret, a network error, a timeout, a non-200 status, a malformed JSON body, or an uncaught exception in `verify` all produce `'refused'` — never a silent pass.
- **Secret is read per-request**, not once at startup, so rotating the env var takes effect immediately without a deploy.
- **`remoteip` is optional** and only improves Cloudflare's scoring; omitting it still yields a valid verdict.
- The module is intentionally not the only provider; `docs/modules/antibot.md` documents the alternatives and trade-offs.
