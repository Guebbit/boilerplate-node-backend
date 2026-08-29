# src/kernel/authentication.ts

## Purpose

Declares the authentication **port** that the kernel exposes: a typed contract (`AuthResolver`) for turning signed tokens into a lightweight user identity. The concrete implementation is supplied later by the `account` module at boot, so the kernel never imports from a module. This separation lets builds that omit `account` still type-check and run, with authentication simply unavailable.

## Key elements

- **`AuthenticatedUser`** (interface) — The minimal user shape carried in the request context: `id`, `email`, `username`, optional `admin`, optional `imageUrl`. Intentionally *not* the full module document type.
- **`AuthResolver`** (interface) — The port contract. Two methods: `fromAccessToken` and `fromRefreshToken`, each returning `Promise<AuthenticatedUser | undefined>`.
- **`registerAuthResolver(implementation)`** (exported function) — One-time setter called at import time by the module that owns authentication. Stores the implementation in a module-level `let resolver`.
- **`requireResolver()`** (internal) — Throws a descriptive error if no resolver was registered, otherwise returns it. Treating "unregistered" as a real state (not a misconfiguration) keeps guards branch-free.
- **`resolveAccessToken(token)`** (exported) — Bearer-token path. Delegates to the registered resolver's `fromAccessToken`.
- **`resolveRefreshToken(token)`** (exported) — Cookie path. Delegates to the registered resolver's `fromRefreshToken`.

## Relationships

- **`src/modules/account/module.ts`** — At boot, calls `registerAuthResolver` to supply the concrete `AuthResolver` implementation. This file is the *port*; the module is the *adapter*.
- **`src/kernel/middlewares/authorizations.ts`** — Consumes `resolveAccessToken` / `resolveRefreshToken` to populate the request context with an `AuthenticatedUser`, then enforces role-based access.
- **`tests/unit/kernel/authorizations.test.ts`** — Exercises the authorization middleware, which indirectly depends on the token-resolution functions defined here.
- **`docs/theory/modules.md`** — Documents the module/port pattern this file instantiates (kernel declares, module satisfies).

## Notes

- **Reject vs. `undefined` is load-bearing.** A thrown/rejected promise means the token is absent, malformed, expired, or wrongly signed → **401**. A resolved `undefined` means the token is valid but the user no longer exists → **403**. Conflating them turns a deleted admin's 403 into a 401 ("log in again" for an account that cannot). Callers (notably the authorization middleware) branch on this distinction.
- **`Promise.resolve().then(…)` wrapper.** The public resolvers wrap the call in a microtask tick so that a synchronous throw from the resolver (e.g. `requireResolver` failing) is converted into a rejected promise rather than a synchronous exception. Callers can always `.catch`.
- **Single registration, no unregister.** There is no `unregisterAuthResolver`; the binding is intentional and one-shot for the lifetime of the process.
