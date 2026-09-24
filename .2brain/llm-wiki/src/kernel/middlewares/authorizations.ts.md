---
source: src/kernel/middlewares/authorizations.ts
sha256: 44981a354468807fd53578b76c9a7b623eac9fc71b31830312b43489539d8fa6
generated_at: 2026-09-23T17:55:24.432107+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/middlewares/authorizations.ts

## Purpose

Express middleware guards that gate HTTP routes on authentication state and declared permission keys. Built on the token resolvers in `kernel/authentication.ts`, it provides a layered set of checks (`getAuth` → `isAuth`/`isAuthOrCredential` → `requirePermission` → `requireFreshAuth`) so that each route can compose exactly the guarantees it needs. Every identity rejection is audited before the response is sent, guaranteeing a trail for denied requests.

## Key elements

- **`getTokenBearer`** – Extracts the token from the `Authorization` header (second segment); returns `undefined` if absent.
- **`getAuth`** – Populates `request.authContext` (JWT) or `request.caller`/`credentialId` (API key) when a token is present. Never rejects on the JWT path; the one exception is an over-budget `sk_` credential, which receives a 429 via `apiKeyLimiter`. Idempotent: skips resolution if a caller is already set (handles nested router fall-through).
- **`isAuth`** – Rejects 401 unless a bearer-authenticated session (`authContext` + a bearer token on the request) is present. Deliberately excludes API-key callers.
- **`isAuthOrCredential`** – Same as `isAuth` but also admits `sk_…` credential callers (both `hasBearerSession` and `isCredentialCaller` are checked).
- **`requirePermission`** – (Referenced in the module doc-block; content truncated) Rejects 403 when the caller's role does not hold the given permission key. Accepts a **key**, not a role name; `assertDeclared` enforces that the key is owned by a module at boot.
- **`requirePermissionViaCookie`** – SSE-only variant that authenticates via the refresh cookie instead of an `Authorization` header.
- **`requireFreshAuth` / `requireFreshAuthWhen`** – Step-up gates: check `authContext.authTime` against a tier's max-age and, if stale, answer 401 with `WWW-Authenticate: Bearer error="insufficient_user_authentication"` plus a `REAUTH_REQUIRED` error envelope.
- **`errorLocaleKeyFor`** – Maps a code string to its locale key (`generic.error-<dashes>`).
- **`auditRefusal`** – Central helper that records an audit event (with route, method, `outcome: 'failure'`) immediately before a guard rejects.
- **`hasBearerSession` / `isCredentialCaller`** – Discriminators: the former requires both `authContext` and a bearer token; the latter requires both `caller` and `credentialId`.

## Relationships

- **`src/kernel/authentication.ts`** – Supplies `resolveAccessToken`, `resolveRefreshToken`, `resolveCredential`, and `API_KEY_TOKEN_PREFIX`; `getAuth` delegates all token parsing to these resolvers.
- **`src/kernel/ability.ts`** – Provides `holdsKey`, the role→key membership check used by `requirePermission`.
- **`src/kernel/permissions.ts`** – Provides `assertDeclared`, `callerFor`, `callerInScope`, `findKey`, `scopeOfKey`, and the `StepUpTier` type; `getAuth` calls `callerInScope` once to set `request.caller`, and the step-up guards read tier metadata from here.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** – `apiKeyLimiter` is invoked inside `getAuth`'s credential branch to enforce per-credential request budgets before the route executes.
- **`src/infrastructure/http/request.ts`** – `callerContextOf` extracts the audit-relevant caller fields from the request for `auditRefusal`.
- **`src/infrastructure/http/response.ts`** – `rejectResponse` is the sole way guards emit a rejection (401/403/429), ensuring a consistent error envelope.
- **`src/infrastructure/i18n/index.ts`** – `t` resolves the human-readable message in `challengeForFreshAuth` and other rejection bodies.
- **`src/infrastructure/observability/audit.ts`** – `recordAudit`, `coreAuditActions`, and `buildAuditEvent` back every refusal trail.
- **`src/infrastructure/runtime/environment.ts`** – `environmentNumber` is imported (likely used for tier thresholds or feature flags in the truncated portion).
- **Route files** (`account/routes.ts`, `addresses/routes.ts`, `api-keys/routes.ts`, `audit-logs/routes.ts`, `cart/routes.ts`, …) – Mount these guards on their routers; each route composes `getAuth` → `isAuth`/`isAuthOrCredential` → `requirePermission('<key>')` as needed.

## Notes

- **Permission keys, not roles.** Guards accept a key string (e.g. `'cart.read'`). `assertDeclared` ties each key to an owning module at boot, so a typo in a route mount is a startup failure rather than a silently unreachable route.
- **Idempotent `getAuth`.** Nested Express routers that share a URL prefix will fall through; the guard detects an already-resolved caller and short-circuits, avoiding duplicate JWT verification or a second rate-limit budget charge.
- **API-key prefix guard.** `sk_` tokens are identified by prefix _before_ any JWT parse is attempted, preventing a wasted base64url decode.
- **`isAuth` is session-only by design.** API-key callers get 401 here on purpose; routes that _do_ admit machines mount `isAuthOrCredential` instead. Controllers behind `isAuth` can safely assert `request.authContext!.id`.
- **Fail-closed step-up.** A missing or `0` `authTime` (tokens minted before the claim existed) is treated as infinitely old, forcing re-authentication at the first high-risk action.
- **Audit-before-reject invariant.** Every 401/403 path calls `auditRefusal` (or equivalent) _before_ `rejectResponse`, so a denied request always leaves an audit record with route and method.
