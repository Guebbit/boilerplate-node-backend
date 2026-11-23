---
source: src/infrastructure/adapters/pinned-https.ts
source_sha256: 8693d413b749f27eea9bfd3f765e348436619641f6e96d48e37e9268a0ffaa66
context_sha256: c77daa0d8d5a861f2f46569eeca97d5968a478525718ad4602c843e8b9c15682
generated_at: 2026-11-22T02:41:08.111466+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/pinned-https.ts

## Purpose
Single outbound HTTPS path for URLs supplied by a user or provider. Each request is SSRF-checked, DNS-pinned to the validated address, and never redirected. Webhook delivery and avatar download both use it. It lives in its own file so `ssrf-guard.ts` can be mocked whole by `remote-image.test.ts` while the request code stays a separate seam.

## Key elements
- `PinnedHttpsRequestOptions` — options interface:
  - `method`: HTTP method.
  - `headers?`: optional request headers.
  - `body?`: optional string body, written as given. The caller sets `content-length`.
  - `signal`: the caller's total budget. It aborts DNS resolution, the connection and the response wait.
- `pinnedHttpsRequest(rawUrl, options)` — returns `Promise<IncomingMessage>`, resolved once the response headers arrive.
  1. Calls `resolveSafeOutboundTarget(rawUrl, signal)` first.
  2. Then issues a `node:https` `request`, using:
     - `hostname`: the original host, so TLS SNI and certificate checks verify the name.
     - `lookup`: the guard's pin, which always answers with the one validated address.
     - `port`: the URL's port, or 443.
     - `path`: pathname plus search.
     - `signal`: the caller's abort signal.
  3. Ends the request with `body`.
  - Request errors reject the promise.
  - If the guard refuses the URL, the promise rejects with `SsrfRefusedError`.

## Relationships
- `ssrf-guard.ts` — supplies `resolveSafeOutboundTarget`, which validates the host (only `https:` passes) and returns the `hostname` and pinned `lookup` used here.
- `remote-image.ts` and `webhook-delivery.ts` — callers of this function, per the module doc (avatar download and webhook delivery).
- `provider-registry.ts` — a graph neighbor. The file content shows no direct interaction with it.
- `pinned-https.test.ts` — unit tests for this module.

## Notes
- Redirects are never followed. A 3xx comes back as an ordinary response, and the caller must refuse it.
- The response body is not read here. The caller must drain or cap it.
- The pin only fixes the socket address. Because `hostname` stays the original host, certificate verification still checks the name.
