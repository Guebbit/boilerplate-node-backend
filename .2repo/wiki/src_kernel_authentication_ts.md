# src/kernel/authentication.ts

## Purpose

Declares the authentication **port** for the kernel: a pair of token-resolution functions and the user shape they return. The kernel defines *what* resolution must produce; the `account` module supplies *how* at boot via `registerAuthResolver`. This separation keeps the kernel free of any concrete token-parsing or storage dependency and lets a build that omits `account` simply have no auth rather than a half-wired stub.

## Key elements

- **`AuthenticatedUser`** (interface) — the subset of a user record carried in the request context: `id`, `email`, `username`, optional `admin`/`imageUrl`, `authTime` (epoch seconds from the token's `auth_time` claim; `0` = unknown), `amr` (RFC 8176 proof methods, currently `['pwd']`), and optional `analyticsConsent` (`'granted' | 'denied' | undefined`). Deliberately not the full module document type.
- **`AuthResolver`** (interface) — the port: `fromAccessToken` and `fromRefreshToken`, each returning `Promise<AuthenticatedUser | undefined>`.
- **`registerAuthResolver(implementation)`** — called once at import time by the owning module to install its resolver into the module-level `resolver` slot.
- **`resolveAccessToken(token)`** / **`resolveRefreshToken(token)`** — public entry points used by middleware; delegate to the registered resolver after asserting one exists.
- **`requireResolver()`** (internal) — throws if no resolver is registered, treating "unregistered" as a valid build configuration rather than a bug.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Consumes `resolveAccessToken` / `resolveRefreshToken` to authenticate incoming requests, then inspects `AuthenticatedUser` (e.g. `admin`, `analyticsConsent`) for authorization decisions.
- **`src/modules/account/module.ts`** — The supplier side of the port: at module boot it calls `registerAuthResolver` with its concrete token-parsing and user-lookup implementation.
- **`tests/unit/kernel/authorizations.test.ts`** — Exercises the authorization guards that depend on this file's resolution semantics (401 vs 403 paths).

## Notes

- **`undefined` ≠ rejected.** A token that verifies but whose user no longer exists resolves to `undefined`; a malformed/expired/wrongly-signed token *rejects* (throws). Collapsing these turns a deleted admin's 403 into a 401 ("log in again" for an account that cannot). Callers must handle both outcomes distinctly.
- **`authTime: 0`** is a sentinel meaning "claim absent / pre-`auth_time` tokens," which reads as infinitely old. It is not a valid timestamp.
- **`analyticsConsent: undefined`** is a real third state ("never asked"), not "not yet loaded." Do not coalesce it with `false`/`'denied'`.
- The resolver slot is module-scoped and set exactly once per process; there is no unregister API.
