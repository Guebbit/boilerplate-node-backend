# src/kernel/authentication.ts

## Purpose

Declares the authentication **port** the kernel exposes: an interface for turning a signed token into an `AuthenticatedUser`, plus a single-slot registry that the `account` module fills at boot. It exists so that guards and other kernel code can resolve identity without depending on any concrete storage or module, and so that the semantic distinction between "token invalid" (→ 401) and "token valid but user gone" (→ 403) is preserved for callers.

## Key elements

- **`AuthenticatedUser`** (interface) — the minimal user shape carried in request context: `id`, `email`, `username`, optional `admin`, `imageUrl`. Deliberately not the account module's document type.
- **`AuthResolver`** (interface) — the contract the implementing module must satisfy: `fromAccessToken` and `fromRefreshToken`, each returning `AuthenticatedUser | undefined`.
- **`registerAuthResolver(implementation)`** (exported function) — called once at boot to install the resolver. After this call, `resolver` is set.
- **`requireResolver()`** (private) — returns the registered resolver or throws with a descriptive message. Unregistered is a valid state for builds that ship without the `account` module.
- **`resolveAccessToken(token)`** (exported function) — resolves a Bearer token via the registered `fromAccessToken`.
- **`resolveRefreshToken(token)`** (exported function) — resolves a cookie refresh token via the registered `fromRefreshToken`.

## Relationships

- **`src/modules/account/module.ts`** — calls `registerAuthResolver` at import/boot time, supplying the concrete token-verification implementation. This is the sole producer of the registered resolver.
- **`src/kernel/middlewares/authorizations.ts`** — consumes `resolveAccessToken` / `resolveRefreshToken` to identify the caller before evaluating role/permission guards.
- **`tests/unit/kernel/authorizations.test.ts`** — exercises the authorization middleware, which in turn depends on the resolution functions exported here.

## Notes

- `undefined` return from a resolver means "token is valid but the user no longer exists"; a thrown/rejected token means "authentication failed." Callers (the guards) map these to 403 vs 401 respectively. Collapsing the two turns a deleted admin's 403 into a misleading 401.
- An unregistered resolver is **not** a misconfiguration—it is the expected state for a build that omits the `account` module. `requireResolver` throws so that guards fail fast with a clear message rather than silently passing.
- `resolveAccessToken` / `resolveRefreshToken` wrap the call in `Promise.resolve().then(…)` so that a synchronous throw from the resolver is always converted to a rejected promise, keeping the async contract uniform for `await`-ing callers.
