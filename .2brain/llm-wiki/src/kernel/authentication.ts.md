---
source: src/kernel/authentication.ts
sha256: d5c433ed8dddc588bda5b856d624000c5a64ef00b1767a9ac027e8255a474b0c
generated_at: 2026-11-14T18:21:20.913864+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/authentication.ts

## Purpose

Declares the kernel's authentication **port**: the contract for answering "who is making this request?" It defines the `AuthResolver` and `CredentialResolver` interfaces, the token-prefix constants that drive dispatch, and the thin accessor functions the rest of the kernel calls. The `account` module supplies the session resolver at boot; the `api-keys` module supplies the machine-credential resolver. The kernel itself never inspects token internals — it only knows *where* on the request a credential travels.

## Key elements

- **`AuthResolver`** (interface) — the session-auth port: `fromBearer`, `fromCookie`, `watchCookie`, `cookieAuthenticates`, `clearDeadCookie`.
- **`CredentialResolver`** (interface) — the machine-key port: `fromBearerToken`.
- **`StreamWatch`** (interface) — what an SSE stream retains between connect and periodic recheck; its `recheck` outlives individual credential rotation within a family.
- **`ResolvedCredential`** (interface) — a resolved machine credential: `caller` + `credentialId` for audit.
- **`SESSION_TOKEN_PREFIX`** (`'ses_'`) / **`API_KEY_TOKEN_PREFIX`** (`'sk_'`) — plain-string prefixes that let dispatch choose a path without parsing.
- **`registerAuthResolver` / `registerCredentialResolver`** — called once by each owning module's `onRegistered`; install the implementation into a module-level `let`.
- **`resolveBearer`, `resolveCookie`, `watchCookie`, `resolveCredential`, `clearDeadSessionCookie`, `cookieAuthenticatesRequests`** — the accessor functions the middleware/guard actually calls; each falls back to a `malformed` miss (or `false`) when no resolver is registered.
- **Re-exports** — `Resolution` and `ResolveMissReason` from `@types`, so downstream callers import from this module.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — the guard that calls `resolveBearer` / `resolveCredential` / `resolveCookie` and maps the three outcomes (miss, nobody, failure) to the appropriate HTTP response and audit entry.
- **`src/modules/account/module.ts`** — calls `registerAuthResolver` in its `onRegistered` hook to install the session implementation.
- **`src/modules/account/session/resolver.ts`** — the concrete `AuthResolver` implementation that dispatches between JWT and opaque-id strategies.
- **`src/modules/account/session/jwt-strategy.ts`** / **`src/modules/account/session/jwt.ts`** — implement the `eyJ…` JWT branch of `fromBearer`.
- **`src/modules/account/session/cookie-strategy.ts`** — implements the cookie branch of `AuthResolver`.
- **`src/modules/account/session/session-id.ts`** — implements the `ses_…` opaque-id path; depends on `SESSION_TOKEN_PREFIX`.
- **`src/modules/account/session/family-liveness.ts`** — provides the family-liveness check that the `account` module's `watchCookie` implementation (satisfying this file's `StreamWatch` contract) relies on for rotation-aware rechecks.
- **`src/modules/account/session/strategy.ts`** — the strategy interface the above strategies conform to.
- **`src/modules/account/tests/unit/session-id.test.ts`** — unit-tests the `ses_…` resolution logic.
- **`src/modules/account/controllers/get-oauth-callback.ts`** — exercises session resolution during the OAuth redirect flow.
- **`src/modules/api-keys/module.ts`** — calls `registerCredentialResolver` in its `onRegistered` hook.
- **`src/modules/api-keys/credentials.ts`** / **`src/modules/api-keys/services/resolver.ts`** — the concrete `CredentialResolver` implementation.
- **`src/modules/api-keys/tests/integration/activity.test.ts`** — integration tests exercising the `sk_…` path end-to-end.

## Notes

- **Three outcomes, two of them 401.** `miss` (bad token) and `nobody` (valid token, deleted user) both surface as 401 to the caller; only the `miss.reason` string is counted and audited. A `Failure` (infra error) is a *rejected* promise handled by the global error middleware — it is never a "wrong credentials" response.
- **Dispatch is string-prefix only.** `ses_…`, `sk_…`, and `eyJ…` are mutually exclusive, so the kernel picks a path from the first characters without attempting a JWT decode.
- **`account` is load-bearing; `api-keys` is optional.** An unregistered `credentialResolver` yields a `malformed` miss (same "no caller" shape), never a throw. An unregistered `authResolver` does the same, since a build without `account` simply has no sessions.
- **`StreamWatch.recheck` is rotation-aware.** It re-resolves "who is this, *still*?" for the life of the session's family, so an SSE stream survives credential swaps without a reconnect.
- **`clearDeadCookie` flag coupling.** The flags used to clear a refused cookie must match the flags the module used when it set the cookie; a mismatch means the browser keeps sending a credential that can never work.
