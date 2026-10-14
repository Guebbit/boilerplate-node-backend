---
source: src/kernel/cookies.ts
sha256: cce2d463b7e282a7221fda8620bc2b93b2119fa360c2b92f812ba278753d41c2
generated_at: 2026-10-14T08:21:52.049757+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/cookies.ts

## Purpose

Defines the single session-cookie name (`__Host-session`) and a minimal reader for it. This is the canonical credential cookie for the account module: every site that needs to *read* the session cookie goes through this file, keeping the cookie name in one place regardless of whether the underlying value is a refresh token (jwt mode) or a session id (cookie mode).

## Key elements

- **`SESSION_COOKIE`** – Exported constant equal to `'__Host-session'`. The `__Host-` prefix causes browsers to reject the cookie unless it is `Secure`, has `Path=/`, and carries no `Domain`, preventing sibling-subdomain tampering.
- **`readSessionCookie(request)`** – Returns the session cookie value (or `undefined`) from an Express request. Accepts only `Pick<Request, 'cookies'>` so callers don't need a full `Request` object. Delegates to `cookieOf` from the HTTP infrastructure layer.

## Relationships

- **`src/infrastructure/http/cookies.ts`** — Provides the generic `cookieOf` helper that `readSessionCookie` calls. That file handles arbitrary cookie access; this file pins it to the one cookie the kernel cares about.
- **`src/kernel/middlewares/authorizations.ts`** — The SSE-only auth path consumes `readSessionCookie` to authenticate server-sent-events connections that carry no `Authorization` header.
- **`src/modules/account/session/cookies.ts`, `cookie-strategy.ts`, `jwt-strategy.ts`** — Import `SESSION_COOKIE` to *set* or *clear* the cookie; this file is read-only by design.
- **`src/modules/account/controllers/get-refresh-token.ts`** — Reads the cookie (via `readSessionCookie`) to locate the stored refresh token.
- **`src/modules/account/tests/factories.ts`** — Test fixtures set the `SESSION_COOKIE` name so that request factories produce the expected header/cookie pair.
- **`src/modules/notifications/controllers/get-notifications-stream.ts`**, **`src/modules/observability/controllers/get-observability-events.ts`** — SSE endpoints that rely on the cookie-auth path in `authorizations.ts` and therefore transitively depend on this constant.

## Notes

- This module is **read-only** for the cookie. All *writes* (setting, clearing, expiry) live in the account session module. Keep it that way.
- Because the cookie name is the contract between writer and every reader, renaming it here silently breaks every consumer listed above. Treat `SESSION_COOKIE` as an API surface, not an internal detail.
- `readSessionCookie` intentionally takes a minimal `Pick<Request, 'cookies'>` so it can be called from non-Express contexts (tests, SSE upgrade handlers) without importing or constructing a full Express `Request`.
