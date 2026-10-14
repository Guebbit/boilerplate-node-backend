---
source: src/infrastructure/http/read-capped-body.ts
sha256: 15e8a088549b867fa81861bd8ccd0116b2313d82711f616f329363b5d7963abd
generated_at: 2026-10-14T07:59:52.024099+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/read-capped-body.ts

## Purpose

Provides size-capped helpers for reading outbound HTTP response bodies. Standard `response.json()` / `response.text()` buffer the entire payload in memory before parsing, so a compromised or misconfigured provider can exhaust process memory. These utilities stream the body and abort the moment the byte cap is exceeded. Used on every outbound call where the app reads a third-party answer (OAuth token exchange, breached-password range lookup, antibot siteverify).

## Key elements

- **`DEFAULT_BODY_CAP_BYTES`** – Exported constant (1 MiB = 1 048 576). The single cap value every caller passes; sized to be generous for legitimate kilobyte-sized payloads while still stopping a flood.
- **`readCappedText(response, maxBytes)`** – Reads the body as UTF-8 text, chunk by chunk via the WHATWG async-iterable stream. Returns `''` for bodiless responses (204, HEAD). Throws `Error` if cumulative size exceeds `maxBytes`; throws `TypeError` if a chunk is not a `Uint8Array`.
- **`readCappedJson(response, maxBytes)`** – Thin wrapper over `readCappedText` followed by `JSON.parse`. Returns `unknown`; the caller is responsible for narrowing the shape.

## Relationships

- **`src/infrastructure/adapters/antibot-providers/turnstile.ts`** – Calls `readCappedJson` (or `readCappedText`) to read the Turnstile siteverify response.
- **`src/modules/account/oauth/providers/client.ts`** – Reads the OAuth token/record exchange response through this module.
- **`src/modules/account/oauth/providers/github.ts`** – Same pattern for the GitHub OAuth flow.
- **`src/infrastructure/security/breached-passwords/index.ts`** – Reads the HIBP range-lookup response with the cap.
- **`src/infrastructure/config/fields.ts`** – Supplies configuration (e.g. endpoint URLs, timeouts) that the callers of this module use when constructing the `Response` they pass in.
- **`tests/unit/infrastructure/http/read-capped-body.test.ts`** – Unit tests covering the cap enforcement, bodiless-response path, and JSON-parsing path.

## Notes

- Always used in tandem with `redirect: 'error'` on the `fetch` call so that a redirect to a hostile host is rejected *before* a body is ever read.
- The size check is per-chunk and cumulative: the stream is left open (and the connection can be torn down) the instant the running total exceeds `maxBytes`—no full buffering occurs.
- `readCappedJson` deliberately returns `unknown` rather than a typed object; downstream code must validate the shape it expects.
- A bodiless `Response` (null `body`) is a normal case (204, HEAD) and yields `''`, not an exception.
