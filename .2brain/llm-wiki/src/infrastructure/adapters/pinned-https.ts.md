---
source: src/infrastructure/adapters/pinned-https.ts
sha256: 9e5e75dd95b75bde0963f3680e5eff95b4ec9df7072a486332838c58df962b52
generated_at: 2026-11-08T03:22:36.952144+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/pinned-https.ts

## Purpose

The single outbound HTTPS path for any user- or provider-supplied URL. It performs one request that is SSRF-guarded, DNS-pinned (so a second DNS answer cannot reach a private range), and never redirected. Both webhook delivery and avatar download route through it.

## Key elements

- **`PinnedHttpsRequestOptions`** – Interface for one call: `method`, optional `headers`, optional `body` (caller sets `content-length`), and a required `AbortSignal` that aborts DNS resolution, the socket, and the response wait.
- **`pinnedHttpsRequest(rawUrl, options)`** – Resolves the URL via `resolveSafeOutboundTarget` first, then opens an `https.request` pinned to the validated address. Returns the `IncomingMessage` as soon as response headers arrive. The body is **not** read here; the caller drains or caps it. A 3xx is returned as a normal response for the caller to refuse. Rejects with `SsrfRefusedError` when the guard refuses the URL.

## Relationships

- **`ssrf-guard.ts`** – Imports `resolveSafeOutboundTarget`; the guard's returned `target` supplies the hostname (for TLS SNI/cert) and a `lookup` function that always resolves to the one validated IP.
- **`remote-image.ts`** – Avatar-download caller. The doc comment notes that separating the request into this file keeps a clean seam so `remote-image.test.ts` can mock `ssrf-guard` wholesale without touching the socket logic.
- **`webhook-delivery.ts`** – Webhook-delivery caller; routes its outbound POSTs through `pinnedHttpsRequest`.
- **`tests/unit/infrastructure/adapters/pinned-https.test.ts`** – Unit tests for this module.

## Notes

- The `hostname` passed to `https.request` is the **original** host name (so TLS SNI and certificate verification work), while the `lookup` option pins the actual socket to the guard's resolved IP. Do not swap these.
- `body` is written verbatim; the caller is responsible for setting a correct `content-length` header.
- `AbortSignal` aborts at any stage (DNS, connect, response wait) and surfaces as an `AbortError` on the promise.
- Only `https:` URLs pass the guard; `http:` is refused upstream.
