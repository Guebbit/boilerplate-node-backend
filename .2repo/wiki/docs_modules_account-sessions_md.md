# docs/modules/account-sessions.md

## Purpose

Documents the internal session subsystem of the `account` module: how access and refresh tokens are signed, verified, and carried via cookies. It exists so readers understand the auth-resolution chain without re-deriving it from three source files (`config.ts`, `jwt.ts`, `cookies.ts`).

## Key elements

- **`config.ts`** — Parses `NODE_TOKEN_ACCESS_TIME` and the three refresh-tier variables (`SHORT`/`MEDIUM`/`LONG`). Sole place a deployment's session duration is resolved. Holds no token, issues none.
- **`jwt.ts`** — Signs and verifies both token types against the lifetimes in `config.ts`.
- **`cookies.ts`** — Sets and clears the refresh-token cookie and the non-secure logged-in-hint cookie.
- **Resolver (installed by `account` at import time)** — Fills `kernel/authentication.ts` port; returns only `id`, `email`, `username`, `admin`, `imageUrl`. No barrel; not importable outside the module.
- **Two tokens, two transports** — Access token in `Authorization` header (JS-readable); refresh token in `httpOnly` cookie (JS-invisible).
- **Three refresh tiers** — `short` / `medium` / `long`, mapped to env vars, exposed as a single "remember me" choice.
- **Cookie flags** — `httpOnly: true`, `secure: prod only`, `sameSite: lax`, `path: /`, `maxAge` tied to the chosen tier.
- **Logged-in-hint cookie** — Second, non-secure, script-readable cookie carrying no credential; lets the client shell render correct chrome before the first request resolves.
- **Logout path** — Writes/clears the `tokens` subdocument on the user record in `users`, enabling "logout everywhere" as a single write.

## Relationships

- **`docs/modules/account.md`** — Parent module. `account` imports `session/` via relative paths, installs the resolver into the kernel port, and owns the folder. The `account → users` edge is typed `shared-kernel` specifically because this module writes the `users.tokens` array.
- **`docs/api/endpoints.md`** — The login, refresh, and logout endpoints are the external touchpoints that exercise the three session files. The endpoint contracts (which header/cookie to read or set) depend on the conventions documented here.

## Notes

- **Not published.** `session/` has no barrel and must not be imported from outside the module. The only thing `account`'s barrel exports is `addressForCheckout` (for `cart`).
- **401 vs 403 distinction is intentional.** A bad token → `401`; a valid token whose user record is gone → `403`. Collapsing them would leak account existence.
- **`secure` is production-only** so local `http://` development still works without weakening deployed cookies.
- **`path: /`** is set because refresh and logout live on different routes.
- **`config.ts` name is deliberate** — it contains no token logic and issues nothing; it is purely a lifetime parser.
