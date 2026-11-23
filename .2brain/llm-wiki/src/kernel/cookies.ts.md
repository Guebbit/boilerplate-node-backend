---
source: src/kernel/cookies.ts
source_sha256: 216ac1506e690d6bc3ecff05f174aa63b3695d70ad2858e5fee0174d78684d81
context_sha256: 43f74179240b9cdac52ae7634fbfafa6e00682d1f8b13bce12112df66b72f5a7
generated_at: 2026-11-22T03:12:36.242559+00:00
model: claude-code:claude-sonnet-5-5
---

# src/kernel/cookies.ts

## Purpose
Defines the session cookie used by the account module and the SSE-only auth path in `src/kernel/middlewares/authorizations.ts`. It holds the cookie's name, the `Authorization: Bearer` header parser, and a reader for the session cookie on a request. Reading an arbitrary cookie is left to `@infrastructure/http/cookies`.

## Key elements
- `SESSION_COOKIE`: the session cookie's name, taken from `cookieData.session.name` in the generated cookie data. It is one neutral name for both session modes. In `jwt` mode the cookie carries the refresh token, and in `cookie` mode it carries the session id.
- `bearerOf(authorization)`: returns the token from an `Authorization` header that uses the `Bearer` scheme. It returns `undefined` if the header is absent or uses another scheme. The scheme match is case-insensitive (`/^bearer +(\S+)$/i`).
- `readSessionCookie(request)`: returns the session cookie from an incoming request. It calls `cookieOf(request, SESSION_COOKIE)` and only needs `request.cookies`.

## Relationships
- `src/infrastructure/http/cookies.ts`: provides `cookieOf`, the generic cookie reader that `readSessionCookie` wraps.
- `src/kernel/middlewares/authorizations.ts`: the SSE-only auth path named in the module doc. It is a session-cookie consumer, and it is also where the guard that authenticates a request lives.
- `src/modules/account/session/*` (`cookies.ts`, `cookie-strategy.ts`, `jwt-strategy.ts`) and the `get-oauth-callback.ts` and `get-refresh-token.ts` controllers: account-module code that deals with the session credential. The docs describe `SESSION_COOKIE` as the name every session-cookie read site consumes.
- `src/modules/account/tests/factories.ts` and `tests/unit/kernel/bearer.test.ts`: test code in the neighbor list. The bearer test most likely covers `bearerOf`.

## Notes
- The `__Host-` prefix on the cookie name makes browsers refuse the cookie unless it is `Secure`, has `Path=/` and carries no `Domain`. A sibling subdomain therefore can't set or overwrite it.
- `bearerOf` is meant to be the only Bearer parser. The authenticating guard and the logout that retires a credential must read the same one.
