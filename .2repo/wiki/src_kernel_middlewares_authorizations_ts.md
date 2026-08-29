# src/kernel/middlewares/authorizations.ts

## Purpose

Express middleware pipeline for authentication and authorization. Provides composable guards (`getAuth` → `isAuth` → `isAdmin`) that populate `request.authContext` from a Bearer access token, reject unauthenticated or insufficiently-privileged requests, and emit audit events for every rejection. Also exports a cookie-based variant (`isAdminViaCookie`) for SSE endpoints where `EventSource` cannot send an `Authorization` header.

## Key elements

- **`getTokenBearer(request)`** — Strips the `"Bearer "` prefix from the `Authorization` header and returns the raw token string (or `undefined`).
- **`getAuth(request, response, next)`** — Optional auth. Resolves the access token via `resolveAccessToken`; on success attaches a `request.authContext` object (`id`, `email`, `username`, `admin`, `imageUrl`). Silently calls `next()` on missing or invalid tokens — never rejects.
- **`isAuth(request, response, next)`** — Required auth gate. If `request.authContext` or the token is absent, emits a `SECURITY_UNAUTHORIZED` audit event and returns **401** via `rejectResponse`. Must be mounted before `isAdmin`.
- **`isAdmin(request, response, next)`** — Admin gate. Returns **401** if unauthenticated (guards against mis-mounted routes), **403** if authenticated but non-admin. Emits `SECURITY_UNAUTHORIZED` or `SECURITY_FORBIDDEN` audit events respectively.
- **`isAdminViaCookie(request, response, next)`** — Admin gate for cookie-authenticated SSE. Reads the `jwt` cookie, resolves it with `resolveRefreshToken` (signature + revocation check), sets `request.authContext` on success. Returns 401 (no/invalid cookie) or 403 (non-admin), with i18n-localized error bodies.

## Relationships

- **`src/kernel/authentication.ts`** — Source of `resolveAccessToken` and `resolveRefreshToken`; this file delegates all token verification to it.
- **`src/infrastructure/observability/audit.ts`** — Supplies `emitAuditEvent`, `buildAuditEvent`, and `coreAuditActions` used in every rejection path.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)` to populate audit-event caller metadata.
- **`src/infrastructure/http/response.ts`** — Provides `rejectResponse` for all 401/403 responses.
- **`src/infrastructure/i18n/index.ts`** — Provides the `t` translation function used in `isAdminViaCookie` error messages.
- **`src/modules/*/routes.ts`** (account, cart, delivery, feedback, inventory, locales, observability, orders) — Route files that mount these middlewares in their handler chains.

## Notes

- **401 vs 403 convention:** `isAuth` and the unauthenticated branch of `isAdmin` both return 401 (identity unknown); `isAdmin`'s authenticated-but-not-admin branch returns 403 (identity known, insufficient role). `isAdmin`'s 401 branch is defensively reachable only if a future route forgets to mount `isAuth` first.
- **`getAuth` never rejects.** It is designed for endpoints that *may* be public but want user context. All hard enforcement lives in `isAuth`/`isAdmin`.
- **`isAdminViaCookie` sets `admin: true` unconditionally** in `request.authContext` — the non-admin case is rejected before the context is written, so the field is safe to read downstream.
- **Audit before reject.** Every rejection path calls `emitAuditEvent` *before* `rejectResponse`, ensuring the trail captures the attempt even if the response errors.
- **`request.cookies` is cast to `Record<string, string | undefined>`** in `isAdminViaCookie`; the file assumes `cookie-parser` is mounted upstream.
