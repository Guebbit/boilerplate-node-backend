---
source: src/kernel/authentication.ts
sha256: 0e0102f4f47a9e8b9ec34102b790a523f5b77c79fe8bbdb1202809f70e588af8
generated_at: 2026-10-14T14:35:02.396473+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/authentication.ts

## Purpose

Kernel-level port that declares the authentication contract: how a bearer token or session cookie is turned into a resolved caller (or an explicit miss). The kernel owns the dispatch logic (prefix-based) and the resolution type; concrete modules (`account`, `api-keys`) register their implementations at boot. This separation lets the kernel guard treat "no module registered" and "bad token" uniformly without importing any module code.

## Key elements

- **`Resolution<T>`** — discriminated union: `{ ok: T }` or `{ miss: ResolveMissReason }`. Every resolver answer is one of these two shapes.
- **`ResolveMissReason`** — `'invalid_signature' | 'malformed' | 'revoked' | 'expired'`. Distinguishes attack vectors from stale-credential misses for audit purposes.
- **`AuthResolver`** (interface) — `fromBearer`, `fromCookie`, `cookieAuthenticates`. Implemented by `account`.
- **`CredentialResolver`** (interface) — `fromBearerToken`. Implemented by `api-keys`.
- **`ResolvedCredential`** — `{ caller: Caller; credentialId: string }`. The machine-to-machine resolution shape.
- **`SESSION_TOKEN_PREFIX`** (`'ses_'`) / **`API_KEY_TOKEN_PREFIX`** (`'sk_'`) — dispatch constants. A JWT always starts `eyJ`; these prefixes can never collide with it, so the guard can branch on the first characters alone.
- **`registerAuthResolver`** / **`registerCredentialResolver`** — one-shot installers called from each module's `onRegistered`.
- **`resolveBearer`** / **`resolveCookie`** — thin async wrappers that delegate to the registered `AuthResolver`. Throws via `requireResolver` if no module registered one.
- **`cookieAuthenticatesRequests`** — per-call query; returns `false` when no resolver exists.
- **`resolveCredential`** — delegates to the registered `CredentialResolver`, or returns `{ miss: 'malformed' }` if `api-keys` is absent (deliberately *not* a throw).
- **`requireResolver`** (module-private) — throws a plain `Error` when `resolver` is `undefined`. A plain `Error` is never an infra failure, so the guard still proceeds anonymous.

## Relationships

- **`src/types/auth-context.ts`** — supplies `AuthContext` and `Caller`, the types `Resolution` wraps and `ResolvedCredential` embeds.
- **`src/kernel/middlewares/authorizations.ts`** — the guard that calls `resolveBearer` / `resolveCookie` / `resolveCredential` and maps both `miss` and `ok: undefined` to a 401.
- **`src/modules/account/module.ts`** — calls `registerAuthResolver` during `onRegistered`, installing the account resolver.
- **`src/modules/account/session/resolver.ts`** — the concrete `AuthResolver` implementation that delegates to strategies.
- **`src/modules/account/session/strategy.ts`** — strategy interface that `jwt-strategy` and `cookie-strategy` implement.
- **`src/modules/account/session/jwt-strategy.ts`** / **`cookie-strategy.ts`** — the two strategies the resolver dispatches between.
- **`src/modules/account/session/jwt.ts`** — JWT sign/verify used by the JWT strategy.
- **`src/modules/account/session/session-id.ts`** — mints and validates `ses_…` opaque ids (the `cookie` path).
- **`src/modules/account/tests/unit/session-id.test.ts`** — unit tests for session-id behaviour that feeds `resolveCookie`.
- **`src/modules/api-keys/module.ts`** — calls `registerCredentialResolver` during `onRegistered`.
- **`src/modules/api-keys/services/resolver.ts`** — the concrete `CredentialResolver` implementation.
- **`src/modules/api-keys/credentials.ts`** — credential validation logic used by that resolver.
- **`src/modules/api-keys/tests/integration/api-keys.test.ts`** / **`activity.test.ts`** — integration tests exercising the `sk_…` path end-to-end.

## Notes

- **Three outcomes, two visible to callers.** `miss` (bad token) and `ok: undefined` (user deleted) both surface as 401 to the client; only the miss *reason* is logged/audited. A rejection (thrown) signals infra outage (Mongo/Redis down) and is the only path that yields a 5xx.
- **Asymmetric unregistered-resolver handling.** `resolveBearer`/`resolveCookie` throw when `account` is absent (a hard requirement for any build). `resolveCredential` returns `{ miss: 'malformed' }` when `api-keys` is absent (a soft, deletable module). Do not "fix" this asymmetry — it is intentional.
- **Prefix constants live here, not in the owning module.** The dispatch decision (which resolver to call) is a kernel concern; the modules only *implement* the resolution.
- **Module-level `let` bindings.** Resolvers are mutable singletons with no deregistration path. Registration is idempotent only in the sense that a second call overwrites the first; the codebase assumes exactly one call per resolver per process.
