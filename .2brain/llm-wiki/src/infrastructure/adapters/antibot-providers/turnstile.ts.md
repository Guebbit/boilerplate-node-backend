---
source: src/infrastructure/adapters/antibot-providers/turnstile.ts
sha256: 80fc26f553baa5d836c70bd1be76433cc38cbbb29412f97f1c15db6cb7488d41
generated_at: 2026-11-14T17:51:50.683467+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/turnstile.ts

## Purpose

Reference implementation of the `HumanChallengeProvider` port using Cloudflare Turnstile. Exchanges a client-submitted token for a server-side pass/fail verdict by calling Cloudflare's `siteverify` endpoint. Explicitly shipped as a worked example, not a default recommendation, because selecting it introduces a third-party script into the deployment.

## Key elements

- **`turnstileProvider`** (export) — The `HumanChallengeProvider` object. `publicParameters()` returns the site key and script URL for the client widget; `verify(token, remoteAddress?)` delegates to `siteverify` and catches all errors to `'refused'`.
- **`siteverify(token, remoteAddress?)`** (module-local) — POSTs form-encoded `{ secret, response, remoteip? }` to `VERIFY_URL`. Returns `'ok'` only when the JSON body has `success === true`; every other outcome (non-200, timeout, malformed body) yields `'refused'`.
- **`secretKey()`** (module-local) — Reads `NODE_ANTIBOT_TURNSTILE_SECRET` from `antibotConfig()`. Throws if the provider is selected without a secret, preventing a silent "pass everything" failure mode.
- **`VERIFY_TIMEOUT_MS`** — 5 000 ms; passed to `AbortSignal.timeout` so a slow Cloudflare response cannot hold a request open.
- **`VERIFY_URL`** — Hard-coded Cloudflare siteverify endpoint.

## Relationships

- **`./index`** — Imports the `HumanChallengeProvider` type that `turnstileProvider` satisfies.
- **`../antibot-verdict`** — Imports `RungVerdict` (the `'ok' | 'refused'` union) as the return type of `verify`.
- **`@infrastructure/adapters/config`** — Calls `antibotConfig()` to read the Turnstile secret and site key (read on each call so key rotation needs no restart).
- **`@infrastructure/http/read-capped-body`** — Uses `readCappedJson` and `DEFAULT_BODY_CAP_BYTES` to safely parse the Cloudflare response body with a size cap.

## Notes

- **Fail-closed by design.** Every error path — missing secret, network failure, timeout, non-200, unexpected JSON shape, even an uncaught exception — resolves to `'refused'`. The only path to `'ok'` is an explicit `success: true` from Cloudflare.
- **`redirect: 'error'`** is set on `fetch` so a 3xx response is treated as a refusal rather than following to an arbitrary host.
- **`remoteip` is optional** in the verify call; omitting it simply loses Cloudflare's IP-based scoring signal but does not cause a failure.
- The module JSDoc links to `docs/modules/antibot.md` for the full set of provider alternatives and their trade-offs.
