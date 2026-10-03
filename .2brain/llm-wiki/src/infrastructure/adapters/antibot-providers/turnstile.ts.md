---
source: src/infrastructure/adapters/antibot-providers/turnstile.ts
sha256: 30539cb6d100c47987087e8ee6d9695c94c6b68abe6c9bc968b0f02342b12884
generated_at: 2026-10-01T12:46:35.609000+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/turnstile.ts

## Purpose

Reference implementation of the `HumanChallengeProvider` port using Cloudflare Turnstile. It verifies a client-side token server-side by calling Cloudflare's `siteverify` endpoint and maps the result to a `RungVerdict`. Shipped as a worked example, not a recommendation — selecting it means accepting a third-party script in the page.

## Key elements

- **`turnstileProvider`** (export) — The `HumanChallengeProvider` object: exposes `name: 'turnstile'`, `publicParameters()` (returns the site key and the Turnstile `api.js` script URL), and `verify(token, remoteAddress?)` which delegates to `siteverify` and catches all errors to `'refused'`.
- **`siteverify(token, remoteAddress?)`** — POSTs the token + secret (and optional `remoteip`) to Cloudflare's `siteverify` endpoint with a 5 s `AbortSignal.timeout`. Returns `'ok'` only when the JSON body has `success === true`; everything else (non-200, timeout, malformed body) resolves to `'refused'`.
- **`secretKey()`** — Reads `NODE_ANTIBOT_TURNSTILE_SECRET` from `antibotConfig()` on every call so a key rotation requires no restart. Throws if the secret is empty while the provider is selected, preventing a no-op verification that would pass every caller.
- **`VERIFY_URL` / `VERIFY_TIMEOUT_MS`** — Constants: the Cloudflare endpoint and the 5 000 ms timeout.

## Relationships

- **`src/infrastructure/adapters/antibot-providers/index.ts`** — Provides the `HumanChallengeProvider` type that `turnstileProvider` conforms to; the index likely re-exports or selects this provider by name.
- **`src/infrastructure/adapters/antibot-verdict.ts`** — Provides the `RungVerdict` type (`'ok' | 'refused'`) used as the return value of `siteverify` and `verify`.
- **`src/infrastructure/adapters/config.ts`** — Supplies `antibotConfig()` for reading `NODE_ANTIBOT_TURNSTILE_SECRET` and `NODE_ANTIBOT_TURNSTILE_SITE_KEY`.

## Notes

- **Fail-closed by design.** Any network error, timeout, non-200 response, or unexpected body shape resolves to `'refused'`, never `'ok'`. The `.catch(() => 'refused')` on the exported `verify` is a second safety net.
- **Secret is read per call**, not cached at module load, so a config rotation takes effect immediately.
- **`remoteip` is optional** and only improves Cloudflare's scoring; omitting it is valid.
- The module docstring explicitly flags that choosing Turnstile introduces a third-party script and the associated data-protection considerations; see `docs/modules/antibot.md` for alternatives.
