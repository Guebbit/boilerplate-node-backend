# src/kernel/middlewares/authorizations.ts

## Purpose

Express middleware guards that sit in front of module routes to enforce authentication, authorization, and step-up (re-authentication) policies. Built on the token resolvers in `kernel/authentication.ts`, they populate `request.authContext`, gate routes by role, and challenge callers whose session is too old or missing a required auth method. Every denial is audited before the response is sent.

## Key elements

- **`getTokenBearer(request)`** — extracts the bearer token string from the `Authorization` header; returns `undefined` when absent.
- **`getAuth`** — passive resolver middleware. If a valid token is present it sets `request.authContext`; it never rejects. Mount it before `isAuth`/`isAdmin` on routes that serve both anonymous and authenticated callers.
- **`isAuth`** — rejects 401 (with audit event) when `request.authContext` is missing or no token was supplied.
- **`isAdmin`** — rejects 401 (no caller) or 403 (non-admin), each with an audit event. Must run after `isAuth`.
- **`isAdminViaCookie`** — admin check for SSE endpoints where `EventSource` cannot send an `Authorization` header. Reads the `jwt` cookie, resolves the refresh token (signature *and* DB presence), and rejects 401/403 with i18n error envelopes.
- **`REAUTH_TIME_CRITICAL`** / **`REAUTH_TIME_SENSITIVE`** — step-up freshness windows (seconds) read from env (`NODE_REAUTH_TIME_CRITICAL`, `NODE_REAUTH_TIME_SENSITIVE`), defaulting to 300 / 900.
- **`FreshAuthOptions`** — optional `{ methods?: readonly string[] }` that requires every listed RFC 8176 value to appear in `authContext.amr`.
- **`requireFreshAuth(maxAgeSeconds, options?)`** — curried step-up guard. Rejects 401 with `WWW-Authenticate: Bearer error="insufficient_user_authentication"` and an `errors[].code = 'REAUTH_REQUIRED'` envelope when the caller's `authTime` is older than `maxAgeSeconds` or the `amr` methods are missing.
- **`requireFreshAuthWhen(predicate, maxAgeSeconds, options?)`** — conditional variant: only enforces freshness when `predicate(request)` returns true (e.g., `PUT /account` only when email is changing).

## Relationships

- **`src/kernel/authentication.ts`** — source of `resolveAccessToken` and `resolveRefreshToken`; the only place token verification logic lives.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf(request)` used to build audit events.
- **`src/infrastructure/http/response.ts`** — provides `rejectResponse` for uniform 401/403 shapes.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — provides `t()` for localized error messages in cookie/step-up rejections.
- **`src/infrastructure/observability/audit.ts`** — provides `emitAuditEvent`, `coreAuditActions`, `buildAuditEvent`; every guard denial emits an audit record here.
- **`src/infrastructure/runtime/environment.ts`** — provides `environmentNumber` for reading the two reauth TTLs.
- **Module routes** (`account`, `cart`, `delivery`, `feedback`, `inventory`, `locales`, `observability`, `orders`) — consumers that mount these guards in their Express router chains.

## Notes

- **Mount order is mandatory:** `getAuth` → `isAuth` → `isAdmin` / `requireFreshAuth`. `isAdmin` and `requireFreshAuth` include a defensive `if (!request.authContext)` check for the case where `isAuth` is skipped, but the documented contract still requires the full chain.
- **401 vs 403 convention:** 401 = "authenticate (or re-authenticate) and retry"; 403 = "you are authenticated but not permitted." This is the repo's own rule (see `docs/tools/security.md`), not merely RFC 9470.
- **`amr` is an array of RFC 8176 strings**, not a boolean. New auth methods (e.g. WebAuthn `'hwk'`) are added by callers of `requireFreshAuth` via `options.methods` without touching the guard code.
- **`requireFreshAuthWhen` + `multipart/form-data`:** if the predicate inspects `request.body`, the guard must be mounted *after* `upload.single(...)` (or equivalent body parser); otherwise it reads an empty object and gates nothing.
- **`isAdminViaCookie` is SSE-only.** Do not use it for regular REST routes; it bypasses the access-token path entirely.
- All rejections emit an audit event *before* calling `rejectResponse`, guaranteeing a trail even if the response middleware chain is interrupted.
