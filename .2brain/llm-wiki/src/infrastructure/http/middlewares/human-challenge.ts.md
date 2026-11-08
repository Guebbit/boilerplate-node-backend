---
source: src/infrastructure/http/middlewares/human-challenge.ts
sha256: 464aaa2c79db077744629634f875ba52a79d66af68c855601730fe965d44c8bd
generated_at: 2026-11-08T03:30:35.929170+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/human-challenge.ts

## Purpose

Express middleware gate that, when a human-challenge provider is active, requires the caller to present a provider-verified token (sent via a header) before allowing the request to proceed. Mounted on sensitive routes (signup, reset, contact) to block automated/script traffic. With the default `none` provider it is a no-op that calls `next()` immediately.

## Key elements

- **`TOKEN_HEADER`** (`'antibot-challenge-token'`) — the single header the token travels in, so one gate works for any request shape.
- **`refuse`** — internal helper that delegates to `refuseAntibot` with a 403, an `ANTIBOT_VERIFICATION_FAILED` error code, and an i18n-looked-up message.
- **`humanChallengeGate`** (exported `RequestHandler`) — the middleware itself:
  1. If `isHumanChallengeEnabled()` is false → `next()`.
  2. Resolves the active provider via `resolveHumanChallengeProvider()`.
  3. Missing header → immediate `refuse`.
  4. Token present → `provider.verify(token, request.ip)`; `'ok'` → `next()`, otherwise `refuse`.
  5. Any thrown error from the provider → `refuse` (never a pass).

## Relationships

- **`src/infrastructure/adapters/antibot-providers/index.ts`** — consumed port. This file calls `isHumanChallengeEnabled()` and `resolveHumanChallengeProvider()` to obtain the active adapter; the adapter contract (including `verify`) is defined there.
- **`src/infrastructure/http/middlewares/antibot-log.ts`** — calls `refuseAntibot` to emit the standard error envelope and structured log line.
- **`src/infrastructure/i18n/index.ts`** — imports `t` to resolve the human-readable error message at request time.
- **`src/modules/account/routes.ts`** — consumer; mounts `humanChallengeGate` on signup / reset / contact handlers.
- **`tests/unit/infrastructure/http/middlewares/human-challenge.test.ts`** — unit tests covering the enabled/disabled, token-present/absent, and provider-throw paths.

## Notes

- A **missing** token is treated the same as a **failed** verification — both produce the identical 403 envelope. There is no "retry" signal to the caller.
- Provider errors are swallowed and mapped to a refusal; the original error is never forwarded to the response. If you need to debug provider failures, look at server-side logs rather than the HTTP response.
- The middleware is intentionally stateless: it performs no rate-limiting or session tracking. Rate limiting is handled by the separate `rate-limits` modules in the consuming routes.
- `request.ip` is passed to `provider.verify` so the provider can correlate the token with the originating IP; this is the only piece of request context forwarded.
