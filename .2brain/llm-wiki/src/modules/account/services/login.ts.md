---
source: src/modules/account/services/login.ts
sha256: 9341b46366fae5dc835873890192306b895da0fd6bdfda3b4073dd933bfeef48
generated_at: 2026-11-08T04:18:35.901420+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/login.ts

## Purpose

Handles password-based identity proofing for the account module: `login` authenticates an unauthenticated email/password pair, and `verifyOwnPassword` re-confirms a signed-in caller's password before a sensitive action. Neither function creates or invalidates a session — that is the responsibility of `../session/session`.

## Key elements

- **`DUMMY_PASSWORD_HASH`** — module-level constant; an argon2id hash of 32 random bytes computed once at import. Used as the comparison target when no user row is found, so an unknown email incurs the same CPU cost as a wrong password (prevents a timing-based account-enumeration oracle).
- **`login(email?, password?)`** — validates input via `LoginBody.safeParse`, looks up the user with `userService.findForLogin`, verifies the password (or the dummy hash), then checks `isAuthenticatable`/`isRestorable`. Returns `ResponseSuccess<UserDocument>` or a 401 reject with an i18n message. DB errors are caught and reshaped through `rejectDatabaseEnvelope('auth', …)`.
- **`verifyOwnPassword(userId, password, wrongKey)`** — runs inside `withOwnAccount` (which supplies the caller's own row). Rejects with **422** (not 401) on mismatch or when the account has no stored password (OAuth-only). The `wrongKey` parameter lets each calling flow supply its own i18n error string.

## Relationships

- **`@infrastructure/i18n`** (`src/infrastructure/i18n/index.ts`) — `t()` localises both rejection messages.
- **`@infrastructure/security/password-hash`** — `hashPasswordSync` (boot-time dummy hash) and `verifyPassword` (per-request argon2id check).
- **`@infrastructure/http/response`** — `generateSuccess`, `generateReject`, `validationErrors`, and the `ResponseSuccess` / `ResponseReject` types shape every return.
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope('auth', …)` normalises unexpected DB exceptions into the API's error envelope.
- **`@modules/users`** (`src/modules/users/index.ts`) — provides `userService.findForLogin`, the type guards `isAuthenticatable` / `isRestorable` (the latter defined in `src/modules/users/authenticatable.ts`), and the `UserDocument` type (`src/modules/users/model.ts`).
- **`./caller`** (`src/modules/account/services/caller.ts`) — `withOwnAccount` loads the caller's row and scopes the callback in `verifyOwnPassword`.
- **`src/modules/account/services/index.ts`** — barrel that re-exports this module for the rest of the account service layer.

## Notes

- **401 vs 422 is deliberate.** `login` uses 401 (no session context). `verifyOwnPassword` uses 422 so that a client-side interceptor doesn't misread a wrong-password response as a session expiry and drop a still-valid token.
- **`password` column is `select: false`** on the user model; `findForLogin` is one of the few queries that opts in. Avoid adding ad-hoc `.select('password')` elsewhere.
- **Zod parse result, not raw params, is passed to the DB layer.** The outer signature accepts `email?: string` (to keep the public API loose), but `parseResult.data.email` is what's used downstream so TypeScript narrows the type.
- **Restorable accounts are returned, not rejected.** If the user is in deletion grace (`isRestorable`), `login` still succeeds; the *caller* decides whether to offer a restore UI or proceed. A grace-expired account is treated identically to a wrong password.
- **Dummy hash is computed at import time**, not per request — the argon2id cost is a one-time boot cost, not added to every login latency.
