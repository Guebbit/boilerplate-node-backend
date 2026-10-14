---
source: src/infrastructure/adapters/pinned-https.ts
sha256: 9e5e75dd95b75bde0963f3680e5eff95b4ec9df7072a486332838c58df962b52
generated_at: 2026-10-14T07:47:44.692396+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/pinned-https.ts

## Purpose

The single outbound HTTPS path for any user- or provider-supplied URL. It combines SSRF validation, DNS pinning, and a no-redirect policy into one call so that no code path can accidentally reach a private address or follow a redirect to one. Webhook delivery and remote-avatar downloads both route through it.

## Key elements

- **`PinnedHttpsRequestOptions`** — input shape for one pinned request: `method`, optional `headers`, optional `body` (caller sets `content-length`), and a required `signal: AbortSignal` that budgets the entire request lifecycle.
- **`pinnedHttpsRequest(rawUrl, options)`** — resolves and validates the host via `resolveSafeOutboundTarget`, then issues an `https.request` whose `lookup` is pinned to that one address. Returns `Promise<IncomingMessage>` once response headers arrive. Rejects with `SsrfRefusedError` if the guard refuses the URL.

## Relationships

- **`src/infrastructure/adapters/ssrf-guard.ts`** — imports `resolveSafeOutboundTarget`; the guard runs first and returns the pinned `lookup` function and validated hostname.
- **`src/modules/webhooks/transport/webhook-delivery.ts`** — consumer; sends POST webhooks through `pinnedHttpsRequest`.
- **`src/infrastructure/adapters/remote-image.ts`** — consumer (avatar download); kept as a separate module so `remote-image.test.ts` can mock `ssrf-guard.ts` whole without also stubbing this file.
- **`tests/unit/infrastructure/adapters/pinned-https.test.ts`** — unit tests for this module.

## Notes

- `hostname` in the `httpsRequest` options is the **original** host (for TLS SNI and certificate check); only the socket address is pinned via the `lookup` override. Don't "fix" this to the IP.
- 3xx responses are **not** followed — they are returned as ordinary responses so the caller can refuse them.
- The response body is **not** read or capped here; the caller is responsible for draining it.
- The file exists as its own module (rather than inlining the logic into `remote-image.ts`) specifically to preserve the mock seam for `remote-image.test.ts`.
- See `docs/theory/defences/ssrf.md` for the design rationale.
