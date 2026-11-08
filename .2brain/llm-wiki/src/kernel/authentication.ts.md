---
source: src/kernel/authentication.ts
sha256: 240b638ea9f687615130e4ef454bf45a800b8f7bfa961d9ca99eaa022a75be3e
generated_at: 2026-11-08T03:52:48.015044+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/authentication.ts

## Purpose

Kernel-level port that decouples "who is making this request?" from the modules that actually answer it. It declares the `AuthResolver` and `CredentialResolver` interfaces, holds the single registered instance of each, and exposes thin resolve/clear functions that middlewares and guards call without knowing which module (account or api-keys) supplies the implementation. It also owns the two token-prefix constants used to dispatch between the session path and the machine-key path.

## Key elements

- **`AuthResolver`** (interface) — the port `account` implements. Methods: `fromBearer`, `fromCookie`, `watchCookie`, `cookieAuthenticates`, `clearDeadCookie`.
- **`CredentialResolver`** (interface) — the port `api-keys` implements. Single method: `fromBearerToken`.
- **`StreamWatch`** (interface) — returned by `watchCookie`; holds the current `AuthContext` plus a `recheck()` closure that survives credential rotation for the life of the SSE family.
- **`ResolvedCredential`** (interface) — the resolved shape for `sk_…` tokens: a permission-floored `Caller` and a `credentialId`.
- **`SESSION_TOKEN_PREFIX`** (`'ses_'`) / **`API_KEY_TOKEN_PREFIX`** (`'sk_'`) — string constants used by the dispatcher to route a bearer value to the correct resolver without attempting a parse first.
- **`registerAuthResolver` / `registerCredentialResolver`** — one-shot install calls; each module calls its own during `onRegistered`.
- **`resolveBearer` / `resolveCookie`** — resolve a session credential. Return `{ miss: 'malformed' }` when no resolver is registered (guest), never throw.
- **`resolveCredential`** — resolve an `sk_…` token. Same unregistered-is-a-miss contract; `api-keys` is optional in a build.
- **`watchCookie`** — SSE-specific; unlike the others, it *requires* a registered resolver and throws if none exists.
- **`clearDeadSessionCookie`** — clears a cookie the resolver has permanently rejected; no-op when no resolver is present.
- **`cookieAuthenticatesRequests`** — per-call flag: does the session cookie gate ordinary routes, or only the two SSE endpoints?

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — primary consumer; calls `resolveBearer`, `resolveCookie`, `resolveCredential`, `cookieAuthenticatesRequests`, and `clearDeadSessionCookie` to guard every route.
- **`src/modules/account/module.ts`** — calls `registerAuthResolver` at boot, passing its concrete `AuthResolver`.
- **`src/modules/account/session/resolver.ts`** — the concrete implementation of `AuthResolver` that `account` installs.
- **`src/modules/account/session/cookie-strategy.ts` / `jwt-strategy.ts` / `jwt.ts` / `session-id.ts` / `family-liveness.ts`** — internal pieces behind `fromBearer`, `fromCookie`, and `watchCookie`; `family-liveness` underpins the `recheck` closure in `StreamWatch`.
- **`src/modules/account/controllers/get-oauth-callback.ts`** — exchanges an OAuth code and ultimately produces a session credential resolvable through `fromBearer`/`fromCookie`.
- **`src/modules/api-keys/module.ts`** — calls `registerCredentialResolver` at boot.
- **`src/modules/api-keys/credentials.ts` / `services/resolver.ts`** — the concrete `CredentialResolver` implementation.
- **`src/modules/account/tests/unit/session-id.test.ts`** and **`src/modules/api-keys/tests/integration/activity.test.ts`** — exercise the resolution paths defined here.

## Notes

- **Three-outcome contract is load-bearing.** `Miss` (bad/expired/revoked token), `Nobody` (valid token, deleted user), and `Failure` (infra error → throw) are distinct. The authorization guard maps the first two identically to a 401; it counts and audits only the *miss reason*. Callers must not rely on distinguishing "bad token" from "user gone" at the HTTP layer.
- **Unregistered resolver is a valid build state**, not a misconfiguration. A build without `account` yields `{ miss: 'malformed' }` (a guest) from `resolveBearer`/`resolveCookie`. A build without `api-keys` likewise yields a miss from `resolveCredential`. The one exception is `watchCookie`, which throws because an SSE stream cannot function without a live session.
- **Prefix constants live here, not in the owning modules.** The dispatch decision (is this `sk_…` or a session credential?) is a kernel concern; the modules never see each other's tokens.
- **`clearDeadCookie` flags must match the cookie that set it.** The interface docstring warns the flags must stay in sync with the module that originally set the cookie; a mismatch would leave the browser sending a dead credential indefinitely.
