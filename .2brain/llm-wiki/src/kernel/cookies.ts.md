---
source: src/kernel/cookies.ts
sha256: 300028b88ebd05331fc951975246007149c933609baba662530c7b2f377ee6c0
generated_at: 2026-10-15T09:51:27.144175+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/cookies.ts

## Purpose

Defines the kernel-level parsing and naming conventions for authentication credentials: the session cookie name (`__Host-session`) and the Bearer-token extractor used by the authorization middleware. It sits above the infrastructure cookie utilities so that every read-site shares one canonical cookie name and one Bearer parser.

## Key elements

- **`SESSION_COOKIE`** (`'__Host-session'`) — the single cookie name for all session modes. The `__Host-` prefix enforces `Secure`, `Path=/`, and no `Domain`, preventing sibling-subdomain forgery. In `jwt` mode it carries the refresh token; in `cookie` mode it carries the session id.
- **`bearerOf(authorization)`** — parses the `Authorization: Bearer <token>` header (case-insensitive scheme word, per RFC 9110 §11.1 / RFC 6750 §2.1) and returns the token string, or `undefined` when the header is absent or uses a different scheme. This is the one and only Bearer parser shared by the auth guard and the logout path.
- **`readSessionCookie(request)`** — thin wrapper around `cookieOf` (from `@infrastructure/http/cookies`) that reads the `SESSION_COOKIE` value off an Express request's `cookies` bag.

## Relationships

- **`src/infrastructure/http/cookies.ts`** — provides the generic `cookieOf(request, name)` helper that `readSessionCookie` delegates to.
- **`src/kernel/middlewares/authorizations.ts`** — the SSE-only authorization guard that calls `bearerOf` to authenticate requests.
- **`src/modules/account/session/cookie-strategy.ts`** / **`jwt-strategy.ts`** — session-mode strategies that set or clear the cookie named by `SESSION_COOKIE`.
- **`src/modules/account/session/cookies.ts`** — account-module cookie helpers (set/clear) that reference the same `SESSION_COOKIE` constant.
- **`src/modules/account/controllers/get-refresh-token.ts`** — reads the session cookie (jwt mode refresh token) via `readSessionCookie`.
- **`tests/unit/kernel/bearer.test.ts`** — unit tests covering `bearerOf`'s parsing edge cases.
- **`src/modules/account/tests/factories.ts`** — test fixtures that set `SESSION_COOKIE` on mock requests.

## Notes

- `bearerOf` tolerates multiple spaces between `bearer` and the token (`/^bearer +(\S+)$/i`); the scheme word is matched case-insensitively.
- The file intentionally does **not** handle reading arbitrary cookies — that belongs to `@infrastructure/http/cookies`. `readSessionCookie` is the only cookie reader in the kernel.
- The `__Host-` prefix is a browser-enforced security constraint (MDN: cookie prefixes); servers should still set `Secure`, `Path=/`, and omit `Domain` explicitly to comply.
