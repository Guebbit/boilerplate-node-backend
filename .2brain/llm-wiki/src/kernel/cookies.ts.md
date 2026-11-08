---
source: src/kernel/cookies.ts
sha256: 216ac1506e690d6bc3ecff05f174aa63b3695d70ad2858e5fee0174d78684d81
generated_at: 2026-11-08T03:53:08.680397+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/cookies.ts

## Purpose

Thin kernel-level helpers for the two credential channels a request can carry: the **session cookie** (name + reader) and the **`Authorization: Bearer` header** (token parser). It sits above the generic infrastructure cookie utilities and below every consumer that needs to *read* a session credential, providing one shared name and one shared parser so that authentication, logout, and session strategies all agree on the same source of truth.

## Key elements

- **`SESSION_COOKIE`** — the cookie name (imported from `cookieData.session.name` in `@infrastructure/http/cookies.generated`). Used by both `jwt` mode (carries the refresh token) and `cookie` mode (carries the session id). The `__Host-` prefix enforces `Secure`, `Path=/`, and no `Domain`.
- **`bearerOf(authorization)`** — parses a `Bearer <token>` value from an `Authorization` header string (case-insensitive scheme, per RFC 9110/6750). Returns the token or `undefined` if the header is absent or uses another scheme. The single parser shared by the auth guard and the logout flow.
- **`readSessionCookie(request)`** — reads the session cookie off an Express request via the infrastructure `cookieOf` helper. Accepts any object with a `.cookies` property.

## Relationships

- **`src/infrastructure/http/cookies.ts`** — provides the generic `cookieOf` utility that `readSessionCookie` delegates to. This file is the *named/session* layer; that file handles arbitrary cookie access.
- **`src/kernel/middlewares/authorizations.ts`** — the SSE-only auth path that consumes `bearerOf` (and/or `readSessionCookie`) to authenticate a request.
- **`src/modules/account/session/cookie-strategy.ts` / `jwt-strategy.ts`** — the two session modes that define what the cookie *contains*; both rely on the `SESSION_COOKIE` name this file exports.
- **`src/modules/account/session/cookies.ts`** — account-module-specific cookie helpers built on top of the kernel constant.
- **`src/modules/account/controllers/get-oauth-callback.ts` / `get-refresh-token.ts`** — read the session cookie via `readSessionCookie` during OAuth / refresh-token flows.
- **`tests/unit/kernel/bearer.test.ts`** — unit tests for `bearerOf`.
- **`src/modules/account/tests/factories.ts`** — test factories that reference `SESSION_COOKIE` when building mock requests.

## Notes

- Do **not** import `cookieOf` directly from `@infrastructure/http/cookies` when you specifically need the *session* cookie; use `readSessionCookie` here so the name stays in one place.
- `bearerOf` is a pure regex match — it does not validate the token, only extracts it. Validation belongs to the caller (auth guard, strategy).
- The `__Host-` prefix on the cookie name is load-bearing: it forces browser-side security guarantees. Renaming the constant to drop the prefix would silently weaken cookie isolation.
