---
source: src/infrastructure/adapters/antibot-providers/turnstile.ts
source_sha256: a7d174ef0591d71c967d263e917d3e1823479207d5581b7a8da08ea3c1bc3fba
context_sha256: 690f94ab95550f90acdb869efc6a47584a7217f08a280f7777c9b7a45bbf6e86
generated_at: 2026-11-22T02:34:32.054171+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/antibot-providers/turnstile.ts

## Purpose
Reference implementation of the human-challenge port using Cloudflare Turnstile. It supplies the public parameters the client needs to render the widget and verifies the client's token server-side against Cloudflare's `siteverify` endpoint. It is shipped as an example, not a recommendation: selecting it means loading a third-party script and taking on the data-protection implications (see `src/modules/antibot/module.ts`).

## Key elements
- `turnstileProvider` (exported): a `HumanChallengeProvider` named `'turnstile'`.
  - `publicParameters()` returns `{ siteKey, scriptUrl }`. The site key comes from `NODE_ANTIBOT_TURNSTILE_SITE_KEY` (empty string if unset). The script URL points to Cloudflare's Turnstile client script.
  - `verify(token, remoteAddress)` calls `siteverify` and converts any rejection into `'refused'`.
- `siteverify` (internal): POSTs a form-encoded body (`secret`, `response`, and optional `remoteip`) to `VERIFY_URL`. It returns `'ok'` only when the response is HTTP 200 and the parsed JSON has `success === true`. Everything else returns `'refused'`.
- `secretKey` (internal): reads `NODE_ANTIBOT_TURNSTILE_SECRET` through `antibotConfig()` on each call. It throws if the secret is empty.
- `VERIFY_URL` and `VERIFY_TIMEOUT_MS` (5000 ms): internal constants.

## Relationships
- `./index` supplies the `HumanChallengeProvider` type that `turnstileProvider` implements.
- `../antibot-verdict` supplies the `RungVerdict` type returned by `siteverify`. Only `'ok'` and `'refused'` are produced here.
- `@infrastructure/adapters/config` supplies `antibotConfig()`, the source of the site key and secret.
- `@infrastructure/http/read-capped-body` supplies `readCappedJson` and `DEFAULT_BODY_CAP_BYTES`, which bound how much of Cloudflare's response is read.

## Notes
- It fails closed. A non-OK status, timeout, redirect, oversized or malformed body, network error, or missing secret all end as `'refused'`, never a pass.
- A missing secret makes `secretKey` throw. The throw happens inside the `siteverify` call, so `verify`'s `.catch` turns it into `'refused'`. A misconfigured deployment therefore refuses every caller rather than passing them.
- The secret is read fresh on each verification, so rotating it needs no restart.
- The request uses `AbortSignal.timeout(5000)` so a slow Cloudflare doesn't hold a signup open. `redirect: 'error'` means redirects are not followed.
- Only Cloudflare's `success` flag is read from the response. The body is treated as `unknown`.
- `remoteip` is optional and is sent only when a remote address is provided.
