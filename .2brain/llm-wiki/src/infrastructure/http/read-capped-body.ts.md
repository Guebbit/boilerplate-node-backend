---
source: src/infrastructure/http/read-capped-body.ts
sha256: b31ce1221c1f0863b1c2a0302963820ca10c2a57e38153e8aebab3f425ff2c8d
generated_at: 2026-10-29T02:04:46.912154+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/read-capped-body.ts

## Purpose

Provides size-capped reading of outbound HTTP response bodies so a compromised or misconfigured upstream cannot force the process to buffer unbounded data. Every caller that receives a third-party response (OAuth token/user endpoints, breached-password lookups, antibot siteverify) reads through these helpers instead of the unbounded `response.json()` / `response.text()` / `response.arrayBuffer()` defaults.

## Key elements

- **`DEFAULT_BODY_CAP_BYTES`** (`1_048_576`) — the standard 1 MiB cap shared by all callers; expected payloads are kilobytes.
- **`readCappedBytes(stream, maxBytes)`** — core primitive. Iterates an `AsyncIterable<unknown>` (fetch body or Node `IncomingMessage`), accumulates `Uint8Array` chunks, and throws once the running total exceeds `maxBytes`. Rejects non-`Uint8Array` chunks with a `TypeError`. Returns a `Buffer`.
- **`readCappedText(response, maxBytes)`** — convenience wrapper around `readCappedBytes` that UTF-8-decodes the result. Returns `''` for bodiless responses (204, HEAD) instead of throwing.
- **`readCappedJson(response, maxBytes)`** — convenience wrapper around `readCappedText` followed by `JSON.parse`. Returns `unknown`; the caller is responsible for narrowing the shape.

## Relationships

- **`src/modules/account/oauth/providers/client.ts`**, **`src/modules/account/oauth/providers/github.ts`** — consume `readCappedJson` / `readCappedText` to parse token and user responses from the OAuth flow.
- **`src/infrastructure/security/breached-passwords/index.ts`** — consumes `readCappedJson` for the HIBP range-lookup response.
- **`src/infrastructure/adapters/antibot-providers/turnstile.ts`** — consumes `readCappedJson` / `readCappedText` for the Cloudflare Turnstile siteverify call.
- **`src/infrastructure/adapters/remote-image.ts`** — consumes `readCappedBytes` to bound the downloaded image payload.
- **`src/infrastructure/config/fields.ts`** — exports the configuration value that feeds `maxBytes` at the call sites.
- **`tests/unit/infrastructure/http/read-capped-body.test.ts`** — unit tests for all three public functions.

## Notes

- Callers must set `redirect: 'error'` on the `fetch` call; the cap alone does not prevent a redirect to a hostile host.
- Exceeding the cap throws *during* iteration, which cancels (or destroys) the underlying stream — no data is buffered past the cap.
- `readCappedJson` deliberately returns `unknown` rather than a typed shape; treat every provider response as an untrusted claim and narrow at the call site.
- The `Uint8Array` type-guard in `readCappedBytes` is a defense against a broken or spoofed stream, not a performance check.
