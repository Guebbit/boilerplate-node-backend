---
source: src/modules/account/services/login.ts
sha256: 2ee68d5662eed74fd9bf992f70f1f94884cdd56ec8289d984e8fdc36d93a3452
generated_at: 2026-10-15T10:00:40.452697+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/login.ts

## Purpose

Provides two password-verification primitives for the account module: `login` (unauthenticated email/password → user document) and `verifyOwnPassword` (authenticated caller re-confirming their password before a sensitive action). Neither function mints or touches a session token; that concern is delegated to the sibling `session` service.

## Key elements

- **`DUMMY_PASSWORD_HASH`** (module-level `const`) — An argon2id hash of random bytes computed once at import time. Used as the comparison target when no user record is found, so the hash-verification cost is constant regardless of whether the email exists (prevents timing-based account enumeration).
- **`login(email?, password?)`** — Validates input via the `LoginBody` Zod schema, looks up the user with `userService.findForLogin`, then runs `verifyPassword` against the stored hash (or the dummy hash on a miss). Returns `ResponseSuccess<UserDocument>` or `ResponseReject` (422 for validation, 401 for auth failure).
- **`verifyOwnPassword(userId, password, wrongKey)`** — Verifies the caller's own current password inside a `withOwnAccount` guard. Returns 422 (never 401) on mismatch or on OAuth-only accounts that store no password, to avoid triggering client-side session-expiry interceptors.

## Relationships

- **`@infrastructure/security/password-hash`** — Calls `hashPasswordSync` (once, at import) and `verifyPassword` (per request) for argon2id comparison.
- **`@infrastructure/http/response`** — Uses `generateSuccess`, `generateReject`, and `validationErrors` to shape every return value; also the source of the `ResponseSuccess` / `ResponseReject` types in the signatures.
- **`@infrastructure/http/errors`** — Calls `rejectDatabaseEnvelope('auth', error)` in the `.catch` of `login` to normalise unexpected DB failures.
- **`@infrastructure/i18n`** — Calls `t(key)` to localise rejection messages (both the fixed `account.login.wrong-data` key and the caller-supplied `wrongKey` in `verifyOwnPassword`).
- **`@modules/users`** — Calls `userService.findForLogin(email)` to retrieve the user document (including the `select:false` password field); consumes the `UserDocument` type in return values.
- **`./caller`** — Wraps `verifyOwnPassword`'s body in `withOwnAccount(userId, …)` so the caller's identity is resolved and the guard handles "not signed in" / "not their own account" before any password logic runs.

## Notes

- The `email` and `password` parameters in `login` are typed `string | undefined` (not the Zod-inferred types) so the function can be called from routes before validation; the Zod `safeParse` inside the function is the actual type gate. Downstream code must use `parseResult.data.email`, not the raw param.
- `verifyOwnPassword` deliberately returns **422**, not 401, on failure. The `wrongKey` parameter lets each caller (change-password, add-2FA, etc.) supply its own i18n message while keeping the HTTP status uniform.
- `DUMMY_PASSWORD_HASH` is a one-time import-time cost. It is **not** re-computed per request, but it does add a small constant to cold-start time.
- `userService.findForLogin` is one of the few query paths that selects the `password` field (normally `select: false` on the user model). Avoid calling this method in non-auth flows.
