---
source: src/kernel/middlewares/authorizations.ts
sha256: 7a4e1d97bfaad4cb61ff4541785148afe90d09b426295aa833f80cb323866dc4
generated_at: 2026-10-29T02:19:42.142515+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/middlewares/authorizations.ts

## Purpose

Express middleware guards that sit in front of routes to resolve identity and enforce authorization. Built on the kernel's authentication resolver, the file provides a family of guards (`getAuth`, `isAuth`, `requirePermission`, `requirePermissionViaCookie`, `requireFreshAuth`/`requireFreshAuthWhen`) that either populate `request.authContext`/`request.caller` or reject the request. Every rejection is audited and, where it names an attack, recorded as a security event before the response is sent.

## Key elements

- **`getAuth`** — Resolves `request.authContext` from a bearer token or (in cookie-session mode) a session cookie; anonymous callers pass through with no context set.
- **`isAuth`** — Rejects with 401 when `authContext` is absent after `getAuth`.
- **`requirePermission`** — Rejects with 403 when the resolved caller's role does not hold the declared rule; takes an action + subject, never a raw role name.
- **`requirePermissionViaCookie`** — SSE-only variant that authenticates via the session cookie instead of the `Authorization` header.
- **`requireFreshAuth` / `requireFreshAuthWhen`** — Gate an already-authenticated caller on how recently they last proved identity (controlled by `reauthWindowSeconds` from config).
- **`getTokenBearer`** — Extracts the bearer token string from the `Authorization` header.
- **`continueWithSession` / `continueWithCookie`** — Internal plumbing that resolves a credential, applies the session to the request, and handles miss/outage paths.
- **`auditRefusal`** — Central helper that stamps route, method, and `outcome: 'failure'` onto every refusal audit record.
- **`noteMiss` / `securityActionFor`** — Classify a refused credential (stale vs. forged vs. revoked) and emit the matching metric or security event.
- **`errorLocaleKeyFor`** — Maps an error-code string to its `generic.error-…` locale key, used for both default and `deniedCode` overrides.

## Relationships

- **`@kernel/authentication`** — Source of `resolveBearer`, `resolveCookie`, `resolveCredential`, `cookieAuthenticatesRequests`, `API_KEY_TOKEN_PREFIX`, and the `Resolution`/`ResolveMissReason` types that drive every guard's decision logic.
- **`@kernel/permissions`** — Provides `assertDeclared` (boot-time rule validation), `callerInScope`/`callerForSubject` (ability computation), `ruleId`, and `StepUpTier` (step-up auth tiers).
- **`@kernel/ability`** — `holds` is the predicate that answers "does this role carry this rule?" for `requirePermission`.
- **`@kernel/cookies`** — `bearerOf` and `readSessionCookie` extract credentials from the wire.
- **`@kernel/config`** — Supplies `reauthWindowSeconds` for the freshness guards.
- **`@infrastructure/http/middlewares/origin`** — `requireAllowedOrigin` is invoked for unsafe (non-`GET`/`HEAD`/`OPTIONS`) cookie-authenticated requests to block CSRF.
- **`@infrastructure/http/middlewares/rate-limit`** — `apiKeyLimiter` enforces a per-key request budget on the API-key credential path.
- **`@infrastructure/http/request`** — `callerContextOf` extracts the identity fields needed for audit and security-event records.
- **`@infrastructure/http/response`** — `rejectResponse` and `ResponseErrorItem` shape the 401/403 error bodies.
- **`@infrastructure/observability/audit`** — `recordAudit`, `buildAuditEvent`, and `coreAuditActions` (from the generated actions list) write the refusal trail.
- **`@infrastructure/observability/security-events`** — `recordSecurityEvent` and `staleCredentialsTotal` emit attack metrics and stale-credential counters.
- **`@infrastructure/i18n`** — `t` localizes user-facing error messages in rejection responses.
- **`@modules/account/routes`** — The account module's routes are the primary consumers of these guards (login, session, profile endpoints).

## Notes

- Guards take **an action and a subject**, never a role-name string. `assertDeclared` makes a typo in a route mount a **boot failure**, not a silently unreachable route.
- The `Session-Passive: true` request header marks polls/keep-alives so they don't count as the user acting; it can only make a session look *more* idle, so it is unforgeable from the client's perspective.
- In cookie-session mode, a refused cookie is **cleared from the response** (`clearDeadSessionCookie`) so subsequent requests skip the lookup entirely.
- API-key rejections send `WWW-Authenticate: Bearer error="invalid_token"` per RFC 6750 §3.1, distinguishing them from anonymous browse.
- The error-locale-key convention (`generic.error-` + lowercase, underscores → hyphens) is uniform across default codes and per-rule `deniedCode` overrides; no extra locale entry is needed for a new override beyond the matching key.
- `SAFE_METHODS` (GET, HEAD, OPTIONS) skip the origin check because a riding-along cookie on them cannot cause a state change.
