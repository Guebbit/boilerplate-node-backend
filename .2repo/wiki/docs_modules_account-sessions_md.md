# docs/modules/account-sessions.md

## Purpose

Documents the session/token subsystem inside the `account` module: how access and refresh tokens are signed, verified, stored, rotated, and cleared, and why none of it is importable from outside `session/`.

## Key elements

- **`config.ts`** — Single source of truth for token lifetimes; parses `NODE_TOKEN_ACCESS_TIME` and the three refresh tiers (`NODE_TOKEN_REFRESH_TIME_SHORT/MEDIUM/LONG`). Holds no token, issues none.
- **`jwt.ts`** — Signs and verifies both access and refresh tokens against the lifetimes from `config.ts`.
- **`cookies.ts`** — Sets/clears the `jwt` cookie with `httpOnly`, `secure` (production only), `sameSite: lax`, `path: /`, and `maxAge` matching the chosen tier. Also manages a second, deliberately non-secure, script-readable "logged-in hint" cookie that carries no credential.
- **Resolver (installed at import time)** — `account` fills the kernel's `kernel/authentication.ts` port the moment its manifest is imported. Every guard (`getAuth`, `isAuth`, `isAdmin`) resolves through this port.
- **Refresh rotation (`tokenSupersede`)** — `GET /account/refresh` atomically claims the old token, mints a new one (same absolute expiry), and retains the superseded entry in the user's `tokens` array. A grace window (`NODE_TOKEN_ROTATION_GRACE_MS`, default 10 s) lets a concurrent retry of the *same* cookie reissue a sibling instead of being flagged as reuse. Outside grace, a superseded presentation revokes the entire refresh set.
- **Logout everywhere** — Writes to the user's `tokens` subdocument (single write, no blocklist). Superseded entries are filtered from `GET /account/sessions` and eventually removed by the housekeeping sweep (`runTokenCleanup` / `tokenRemoveExpired`).

## Relationships

- **`account.md`** — Owns this module; installs the auth resolver at import time and owns the `GET /account/refresh` and `GET /account/sessions` endpoints.
- **`users.md`** — Stores refresh tokens in the `tokens` subdocument; `tokenRemoveExpired` in the users repository handles the cleanup sweep for expired and superseded entries.
- **`cart.md`** — The only published export from this module's barrel is `addressForCheckout`, a single function consumed by cart.
- **`index.md`** — The barrel file; publishes `addressForCheckout` only. `session/` itself has no barrel and must not be imported from outside.
- **`request-flow.md`** — Describes where the kernel guard sits in the request lifecycle; this module is what the guard delegates to.
- **`strategic-ddd.md`** — Explains the `shared-kernel` edge: the `account → users` write to `tokens` is the concrete reason that edge is classified as shared-kernel.
- **`security.md`** — Context for hashing, security headers, and rate-limiting that operate alongside session tokens.

## Notes

- **No external imports.** `session/` is a private folder. The only thing leaving the module boundary is `addressForCheckout` via the barrel. Do not add imports of `session/` from sibling modules.
- **Two distinct auth failures.** A bad/missing token → `401`. A valid token whose user record no longer exists → `403`. Collapsing them would leak account existence.
- **`secure` is production-only.** Local development over plain HTTP still works; the flag is gated to production so the cookie is not silently weakened in dev.
- **Superseded tokens are never `$pull`ed immediately.** They persist past their grace window so a later stale presentation can be distinguished from noise, then removed by the periodic sweep.
- **The "logged-in hint" cookie is intentionally non-secure and script-readable.** It carries zero credential data; its sole purpose is letting the client shell render the correct UI before the first auth-resolved request returns.
