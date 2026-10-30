---
source: src/kernel/authentication.ts
sha256: 240b638ea9f687615130e4ef454bf45a800b8f7bfa961d9ca99eaa022a75be3e
generated_at: 2026-10-29T02:18:55.077994+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/authentication.ts

## Purpose

Kernel-level **port** (hexagonal architecture) that declares the authentication contract. It defines the interfaces modules must implement and the resolve functions the rest of the kernel calls. `account` registers a session/bearer resolver at boot; `api-keys` optionally registers a machine-credential resolver. Callers get a uniform API without importing either module.

## Key elements

- **`AuthResolver`** (interface) — the port `account` implements: `fromBearer`, `fromCookie`, `watchCookie`, `cookieAuthenticates`, `clearDeadCookie`.
- **`CredentialResolver`** (interface) — the port `api-keys` implements: `fromBearerToken` for `sk_…` machine credentials.
- **`StreamWatch`** (interface) — what an SSE stream holds between connect and periodic recheck; `recheck` survives credential rotation within a session family.
- **`SESSION_TOKEN_PREFIX`** (`'ses_'`) / **`API_KEY_TOKEN_PREFIX`** (`'sk_'`) — dispatch prefixes. A JWT always starts with `eyJ`, so prefix alone disambiguates the three credential types without a JWT parse.
- **`registerAuthResolver` / `registerCredentialResolver`** — one-time install functions called from each module's `onRegistered`.
- **`resolveBearer` / `resolveCookie`** — delegate to the registered `AuthResolver`; return `{ miss: 'malformed' }` (a guest) if no resolver is registered.
- **`watchCookie`** — delegates to `AuthResolver.watchCookie`; **throws** if no resolver is registered (SSE guard needs one).
- **`resolveCredential`** — delegates to `CredentialResolver`; returns `{ miss: 'malformed' }` if `api-keys` is absent from the build.
- **`cookieAuthenticatesRequests`** — per-call boolean; `false` when no resolver is registered.
- **`clearDeadSessionCookie`** — instructs the resolver to clear a cookie the browser keeps sending but can never validate.
- **`ResolvedCredential`** (interface) — shape of a successful `sk_` resolution: `{ caller, credentialId }`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — the auth guard that calls `resolveBearer`/`resolveCookie` and maps both miss and nobody to HTTP 401; uses the miss reason for audit counters.
- **`src/modules/account/module.ts`** — calls `registerAuthResolver` during `onRegistered`.
- **`src/modules/account/session/resolver.ts`** — the concrete `AuthResolver` implementation handed to the kernel.
- **`src/modules/account/session/strategy.ts`** — shared strategy type used by the resolver's bearer/cookie paths.
- **`src/modules/account/session/jwt.ts` / `jwt-strategy.ts`** — verify signed access tokens (`fromBearer`).
- **`src/modules/account/session/cookie-strategy.ts`** — verify the session cookie value (`fromCookie`).
- **`src/modules/account/session/session-id.ts`** — handles `ses_…` opaque ids; the prefix constant is defined here in the kernel for dispatch.
- **`src/modules/account/session/family-liveness.ts`** — backs the `StreamWatch.recheck` contract so an SSE stream survives credential rotation within its family.
- **`src/modules/account/controllers/get-oauth-callback.ts`** — consumes an `AuthContext` after the OAuth redirect to set the session.
- **`src/modules/account/tests/unit/session-id.test.ts`** — unit-tests the `ses_` id round-trip.
- **`src/modules/api-keys/module.ts`** — calls `registerCredentialResolver` during `onRegistered`.
- **`src/modules/api-keys/credentials.ts`** — defines the `sk_…` token format and validation.
- **`src/modules/api-keys/services/resolver.ts`** — concrete `CredentialResolver` implementation.
- **`src/modules/api-keys/tests/integration/activity.test.ts`** — integration-tests the `resolveCredential` path end-to-end.

## Notes

- **Unregistered ≠ error (mostly).** `resolveBearer`, `resolveCookie`, and `resolveCredential` all degrade to `{ miss: 'malformed' }` when their resolver is absent — a build without `account` simply has no sessions; a build without `api-keys` simply has no machine tokens. `watchCookie` is the exception: it **throws** because an SSE stream cannot function without a live resolver.
- **Dispatch by prefix, not by parse.** The kernel chooses the credential path (JWT vs. `ses_` vs. `sk_`) from the first characters of the token. This avoids a failing JWT decode on the hot path.
- **Caller indistinguishability.** The guard returns 401 for both "bad token" and "user deleted," so an external caller cannot enumerate accounts. Only the miss *reason* string is preserved for internal audit/telemetry.
- **`cookieAuthenticates()` is per-call**, not a module-level constant — it reflects the deployment's current session mode and can change between requests.
