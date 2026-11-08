---
source: src/infrastructure/adapters/antibot-providers/turnstile.ts
sha256: 2e6da83d93d0fa2bd842dda02135c0df67c7cb852554977953da0952ce5d2a3f
generated_at: 2026-11-08T03:17:12.044622+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/turnstile.ts

## Purpose

Reference implementation of the `HumanChallengeProvider` port using Cloudflare Turnstile. Exchanges a client-supplied token for a server-side pass/fail verdict against Cloudflare's `siteverify` endpoint. Documented as a worked example, not a recommendation — selecting it means accepting a third-party script in the page.

## Key elements

- **`turnstileProvider`** (exported) — the `HumanChallengeProvider` object. Exposes `name`, `publicParameters()` (returns `siteKey` + Turnstile script URL for the client), and `verify(token, remoteAddress?)`.
- **`siteverify`** — internal POST to Cloudflare's siteverify URL. Returns `'ok'` only when the JSON body has `success === true`; every other outcome (non-200, timeout, malformed body) yields `'refused'`.
- **`secretKey`** — reads `NODE_ANTIBOT_TURNSTILE_SECRET` from `antibotConfig()` on every call (supports rotation without restart). Throws if the provider is selected but the secret is unset.
- **`VERIFY_URL` / `VERIFY_TIMEOUT_MS`** — Cloudflare endpoint constant and a 5 s abort timeout.

## Relationships

- **`./index`** — imports the `HumanChallengeProvider` type that this file implements.
- **`../antibot-verdict`** — imports `RungVerdict` (the `'ok' | 'refused'` union) as the return type of `siteverify`.
- **`@infrastructure/adapters/config`** — calls `antibotConfig()` to read the Turnstile site key and secret at request time.
- **`@infrastructure/http/read-capped-body`** — uses `readCappedJson` + `DEFAULT_BODY_CAP_BYTES` to parse the Cloudflare response with a hard byte cap.

## Notes

- **Fail-closed everywhere.** Missing secret throws; timeout, redirect, non-200, malformed JSON, and any thrown error in the `verify` path all resolve to `'refused'`. There is no code path that returns `'ok'` on uncertainty.
- **No redirect following.** `redirect: 'error'` prevents a compromised DNS or MITM from pointing the verify call at an untrusted host.
- **`remoteip` is optional.** It is sent only when the caller provides a client address; Cloudflare treats it as a scoring hint, not a requirement.
- Config is read per-call (not cached at module load) specifically so a secret rotation does not require a process restart.
