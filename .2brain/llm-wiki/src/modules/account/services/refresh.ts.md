---
source: src/modules/account/services/refresh.ts
sha256: ae709b7ebcf2d11bd1337ab1194606a146429089771906b19474f04b03d0b93d
generated_at: 2026-10-14T08:52:52.607569+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/refresh.ts

## Purpose

Implements the refresh-token exchange: it calls the underlying rotation (in `../session/jwt`) to swap a presented refresh token for a fresh access/refresh pair, and records the outcome — success, missing token, invalid token, or token-reuse detection — as a structured audit event. Exists so the controller layer can delegate "do the swap and tell the observability layer what happened" in one call.

## Key elements

- **`refreshAccessToken(refreshToken, context)`** (exported) — Accepts the refresh cookie value (or `undefined`) and a `CallerContext`. Returns a `Promise<RotatedSession>` (new access token, new refresh token, cookie `maxAge`). On the error path it re-throws after recording the audit entry.
- **`MissingRefreshTokenError`** (local) — Sentinel error thrown when the cookie is absent, so the single `.catch` can distinguish "no token" from "token was invalid" via the `metadata.reason` field without the happy path branching twice on the token.

## Relationships

- **`../session/jwt`** — Source of `rotateRefreshToken` (the actual JWT rotation), `TokenReuseError` (thrown when a previously-rotated token is replayed), and the `RotatedSession` return type.
- **`../audit`** — Provides the `accountAuditActions` enum values (`AUTH_TOKEN_REFRESHED`, `AUTH_REFRESH_TOKEN_REUSE_DETECTED`) used in the audit records.
- **`../metrics`** — Provides `authRefreshReuseTotal`, incremented exclusively in the token-reuse branch.
- **`@infrastructure/observability/audit`** — `recordAudit` is the sole sink for all audit events in this file.
- **`@types` / `src/types/auth-context.ts`** — Supplies the `CallerContext` type (carries actor identity, role, request metadata) passed into `recordAudit`.
- **`../services/index.ts`** — Barrel file; re-exports `refreshAccessToken` so controllers import from `services/index` rather than reaching into individual service files.

## Notes

- **Reuse vs. invalid is intentionally distinct.** A replayed (already-rotated) token is audited as `AUTH_REFRESH_TOKEN_REUSE_DETECTED` with the offending `userId` populated, rather than being lumped into `invalid_token`. The code comments flag this as a materially different security fact for whoever reads the audit trail.
- **`actorRole` is always `anonymous` on failure.** The request never carried a verified access token, so admin status cannot be cheaply determined; the code prefers omitting a potentially-wrong role over guessing.
- **The error is re-thrown.** This function does not swallow failures; the controller is responsible for translating the thrown error into an HTTP response.
- **No branching in the happy path.** The missing-token case is modelled as a rejected promise up front so the success `.then` runs unconditionally for any token that was actually present.
