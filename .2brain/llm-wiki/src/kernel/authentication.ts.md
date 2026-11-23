---
source: src/kernel/authentication.ts
source_sha256: f2e9b53f672630de59be2bd7746837a9017c52e58449884fcd161adbf1b84951
context_sha256: fdc320def58408b7c8bc4c89f84bba9683c012c3b5e396ff3adc281b02f07583
generated_at: 2026-11-22T03:12:11.183175+00:00
model: claude-code:claude-sonnet-5-5
---

# src/kernel/authentication.ts

## Purpose
Declares the kernel-side "who is making this request?" port. The `account` module supplies the session resolver at boot, and `api-keys` optionally supplies a machine-credential resolver. The kernel only knows where credentials travel on a request. The modules know what the credentials mean. The file holds the two registration slots and thin wrappers that degrade safely when no resolver is installed.

## Key elements
- **`AuthResolver`** (interface): implemented by `account`. Methods: `fromBearer`, `fromCookie`, `watchCookie`, `cookieAuthenticates` and `clearDeadCookie`.
- **`StreamWatch`**: what an SSE stream holds between connect and periodic recheck. It has the current `context` and a `recheck()` that follows the session *family* across credential rotation.
- **`CredentialResolver`** / **`ResolvedCredential`**: `api-keys` port, `fromBearerToken(token)`. It resolves to a `Caller` already floored to the credential's permissions, plus a `credentialId` for audit.
- **`registerAuthResolver` / `registerCredentialResolver`**: install the implementation. Each is called once, from the owning module's `onRegistered`.
- **`resolveBearer`, `resolveCookie`, `watchCookie`**: delegate to the resolver. With none registered they return a `{ miss: 'malformed' }` resolution.
- **`resolveCredential`**: resolves `sk_…` tokens. With no resolver it returns a `malformed` miss.
- **`clearDeadSessionCookie`**: asks the resolver to clear a refused cookie. It does nothing when there is no resolver.
- **`cookieAuthenticatesRequests`**: returns `false` when there is no resolver.
- **`SESSION_TOKEN_PREFIX`** (`'ses_'`) and **`API_KEY_TOKEN_PREFIX`** (`'sk_'`): plain strings used to dispatch between credential types.
- Re-exports the `Resolution` and `ResolveMissReason` types from `@types`.

## Relationships
- **Account module** (`src/modules/account/module.ts`, `src/modules/account/session/resolver.ts`, `src/modules/account/session/cookie-strategy.ts`, `src/modules/account/session/jwt-strategy.ts`, `src/modules/account/session/strategy.ts`, `src/modules/account/session/family-liveness.ts`, `src/modules/account/session/jwt.ts`, `src/modules/account/session/session-id.ts`): this is the supplier side. The kernel declares `AuthResolver` and the account module implements it and registers it. The `ses_` prefix and the family-based session recheck on `StreamWatch` correspond to the session-id and family-liveness pieces there.
- **API-keys module** (`src/modules/api-keys/module.ts`, `src/modules/api-keys/services/resolver.ts`, `src/modules/api-keys/credentials.ts`): supplies the `CredentialResolver` through `registerCredentialResolver`.
- **`src/kernel/middlewares/authorizations.ts`**: the guard that consumes these functions. Per the file's docs, it answers both a miss and "nobody" with 401, and counts and audits the miss reason. It passes a rejection to the global error handler.
- **`src/modules/account/controllers/get-oauth-callback.ts`**: a neighbor in the graph. This file does not show what it uses.
- **Tests** (`src/modules/account/tests/unit/session-id.test.ts`, `src/modules/api-keys/tests/integration/activity.test.ts`): neighbors in the graph that exercise the related session-id and API-key behavior.

## Notes
- **Three outcomes** that callers must tell apart:
  - **Miss** resolves `{ miss: reason }`, for a malformed, expired, wrongly signed or revoked token.
  - **Nobody** resolves `{ ok: undefined }`, when the token is valid but the user is gone.
  - **Failure** *rejects*, for example when Mongo or Redis is unreachable. It is never reported as bad credentials.
- The guard answers a miss and "nobody" with the same 401, so a caller cannot tell a bad token from a deleted account.
- The wrappers use `Promise.resolve().then(...)`. A synchronous throw from a resolver therefore becomes a rejection, not a synchronous exception.
- No resolver registered is treated differently for each port. A missing session resolver (no `account`) and a missing credential resolver (no `api-keys`) both give a `malformed` miss, never a throw. The file's rationale is that `account` is load-bearing in every build, while `api-keys` is deletable.
- `API_KEY_TOKEN_PREFIX` lives in the kernel because the dispatch between credential paths is a kernel concern. A JWT always starts `eyJ`, so it cannot collide with `sk_` or `ses_`, which lets `getAuth` dispatch on the prefix alone.
- `cookieAuthenticates()` is evaluated per call, because it follows the deployment's session mode. The cookie may authenticate every route, or only the two SSE streams.
- The module header cross-references a security doc, in the section titled "401 or 403 and why the guards agree".
