# docs/modules/account-sessions.md

## Purpose

Documents the session subsystem: how access/refresh tokens are generated, verified, and stored in cookies, and why the `session/` folder is deliberately sealed off from all other modules.

## Key elements

- **`config.ts`** — Parses the three refresh-tier lifetimes (`NODE_TOKEN_REFRESH_TIME_SHORT/MEDIUM/LONG`) and the access-token lifetime (`NODE_TOKEN_ACCESS_TIME`) into a single config object. Holds no token; issues none.
- **`jwt.ts`** — Signs and verifies both the access token and the refresh token against the lifetimes from `config.ts`.
- **`cookies.ts`** — Sets/clears the `httpOnly` refresh-token cookie (flags: `httpOnly`, `secure` in prod only, `sameSite: lax`, `path: /`) and a separate non-secure "logged-in hint" cookie for client-shell rendering.
- **Resolver (installed at import time by `account`)** — Fills the kernel's `authentication` port so every guard (`getAuth`, `isAuth`, `isAdmin`) can resolve identity before the first request. Returns only the port-declared fields (`id`, `email`, `username`, `admin`, `imageUrl`).
- **Two-token model** — Access token in the `Authorization` header (JS-readable); refresh token in the `httpOnly` cookie (not script-accessible).
- **Logout everywhere** — A single write to the user document's `tokens` subdocument (see `users`) invalidates all active sessions without a blocklist.

## Relationships

- **`account`** — Parent module. Installs the resolver into the kernel port at import time and owns all token issuance. `session/` is an internal folder of `account`, not a standalone layer.
- **`users`** — Stores refresh tokens in the user document's `tokens` subdocument. The `account → users` edge is typed `shared-kernel` because `account` writes that array directly.
- **`cart`** — The only external consumer of `account`'s barrel; receives `addressForCheckout`. It never touches `session/` internals.
- **`request-flow`** — Documents where the kernel guard sits in the request lifecycle; the guard delegates to the resolver described here.
- **`strategic-ddd`** — Explains the cost and intent of the `shared-kernel` relationship between `account` and `users`.
- **`security`** — Covers the broader security context (headers, rate limits, hashing) that the cookie flags and token design must satisfy.

## Notes

- **No barrel, no external imports.** `session/` may not be imported from outside `account`. The only thing the `account` barrel publishes is `addressForCheckout` (for `cart`).
- **401 ≠ 403.** A bad/expired token → 401. A valid token whose user record no longer exists → 403 (resolver returns `undefined`). Collapsing these two leaks whether an account exists.
- **`secure` is conditional.** The refresh cookie is `secure` in production but deliberately not in local dev so `http://localhost` works without extra setup.
- **The hint cookie is intentionally non-secure and JS-readable.** It carries no credential; its sole purpose is letting the client shell render correct chrome before the first auth round-trip completes.
