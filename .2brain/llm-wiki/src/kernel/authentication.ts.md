---
source: src/kernel/authentication.ts
sha256: 513b107044f646b4d91aac2ff02d7be404de01191d09d4969b3632fd343891c6
generated_at: 2026-10-15T09:51:17.774535+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/authentication.ts

## Purpose

Declares the kernel's authentication port — the contract that maps a credential (bearer token, session cookie, or machine key) to the caller it names — and provides the thin dispatch layer the guard middleware uses to answer "who is making this request?" It exists so the kernel depends on an abstraction while `account` and `api-keys` each supply a concrete implementation at boot.

## Key elements

- **`AuthResolver`** (interface) — the port `account` implements. Exposes `fromBearer`, `fromCookie`, `watchCookie`, `cookieAuthenticates`, and `clearDeadCookie`.
- **`CredentialResolver`** (interface) — the port `api-keys` implements. Single method `fromBearerToken` that resolves an `sk_…` token to a `ResolvedCredential`.
- **`StreamWatch`** (interface) — what an SSE stream holds: the current `AuthContext` plus a `recheck()` that survives credential rotation within a session family.
- **`ResolvedCredential`** (interface) — `{ caller, credentialId }` returned for the machine-to-machine path.
- **`SESSION_TOKEN_PREFIX`** (`'ses_'`) / **`API_KEY_TOKEN_PREFIX`** (`'sk_'`) — string prefixes used for prefix-based dispatch without attempting a JWT parse.
- **`resolveBearer` / `resolveCookie` / `watchCookie`** — convenience wrappers that delegate to the registered `AuthResolver`; throw if none is registered.
- **`resolveCredential`** — delegates to the registered `CredentialResolver`; returns `{ miss: 'malformed' }` instead of throwing when no `api-keys` module is present.
- **`registerAuthResolver` / `registerCredentialResolver`** — one-time installers called from each module's `onRegistered`.
- **`cookieAuthenticatesRequests` / `clearDeadSessionCookie`** — safe no-op wrappers when no resolver is registered.
- **`Resolution` / `ResolveMissReason`** — re-exported from `@types`; the three-valued outcome (ok / miss / reject).

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — the 401/403 guard calls `resolveBearer`, `resolveCookie`, `resolveCredential`, and `cookieAuthenticatesRequests` to decide authentication and authorisation on every request.
- **`src/modules/account/module.ts`** — calls `registerAuthResolver` during `onRegistered`, supplying the `AuthResolver` implementation built from the session strategies.
- **`src/modules/account/session/jwt-strategy.ts` / `cookie-strategy.ts` / `resolver.ts`** — the concrete strategies that back `fromBearer` and `fromCookie` under the `AuthResolver` contract.
- **`src/modules/account/session/family-liveness.ts`** — powers the `StreamWatch.recheck` logic so an SSE stream outlives individual credential rotations.
- **`src/modules/account/session/jwt.ts` / `session-id.ts`** — provide the token-format helpers (`ses_` prefix, JWT claims) that the kernel's prefix dispatch relies on.
- **`src/modules/api-keys/module.ts`** — calls `registerCredentialResolver` during `onRegistered`.
- **`src/modules/api-keys/credentials.ts` / `services/resolver.ts`** — implement `CredentialResolver.fromBearerToken` for the `sk_…` machine path.

## Notes

- **Three distinct failure modes, two of which look identical to the caller.** *Miss* (`{ miss: reason }`) and *Nobody* (`{ ok: undefined }`) both yield 401; only the *reason* string differs in audit logs. *Outage* (rejected promise) is the only case that is **not** a 401 — it signals infrastructure failure (Mongo/Redis down) and must surface differently.
- **Unregistered resolvers are valid states, not bugs.** `account` is load-bearing (its absence throws on the first authed request), but `api-keys` is optional. `resolveCredential` intentionally returns a `malformed` miss rather than throwing when absent, so the guard needs no special-case branch.
- **Prefix dispatch, not parse.** The kernel distinguishes `ses_…`, `sk_…`, and JWT (`eyJ…`) credentials purely by string prefix before invoking any resolver. This is why the prefix constants live here rather than in the modules that consume them.
- **`cookieAuthenticates` is dynamic.** Its return value tracks the deployment's session mode at call time, not at registration time — do not cache it.
- **`clearDeadCookie` is fire-and-forget.** It sets response headers on a refused session cookie so the browser stops sending it; it does not throw and does not return a value.
