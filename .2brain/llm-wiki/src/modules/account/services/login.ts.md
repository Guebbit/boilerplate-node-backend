---
source: src/modules/account/services/login.ts
sha256: 9341b46366fae5dc835873890192306b895da0fd6bdfda3b4073dd933bfeef48
generated_at: 2026-10-29T02:41:20.675056+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/login.ts

## Purpose

Handles password verification for two distinct flows: anonymous login (email + password) and signed-in callers confirming their own password before a sensitive action. It deliberately does **not** mint or manage sessions — that is the job of `../session/session`.

## Key elements

- **`DUMMY_PASSWORD_HASH`** — module-level `argon2id` hash of a random 32-byte string, computed once at import time. Used as the comparison target when no account is found, so the CPU cost of verification is identical for "unknown email" and "wrong password," eliminating a timing oracle.
- **`login(email?, password?)`** — validates input via `LoginBody.safeParse`, calls `userService.findForLogin`, then verifies the password (falling back to `DUMMY_PASSWORD_HASH` on a miss). Returns `ResponseSuccess<UserDocument>` or a 401/422 `ResponseReject`. An account in deletion grace (`isRestorable`) is returned successfully so the caller can offer a restore instead of a session.
- **`verifyOwnPassword(userId, password, wrongKey)`** — wraps the check in `withOwnAccount`. Rejects with **422** (not 401) on a mismatch or missing password hash, so a client interceptor won't interpret it as a dead session. The `wrongKey` parameter lets each calling context supply its own i18n message.

## Relationships

- **`@infrastructure/security/password-hash`** — imports `hashPasswordSync` (boot-time dummy hash) and `verifyPassword` (per-request check).
- **`@infrastructure/http/response`** — builds every return value via `generateSuccess`, `generateReject`, and `validationErrors`.
- **`@infrastructure/http/errors`** — catches database-level failures through `rejectDatabaseEnvelope`.
- **`@infrastructure/i18n`** — resolves the `t(...)` message keys for user-facing rejection text.
- **`@modules/users`** — uses `userService.findForLogin` (a query that selects the `password: false` field) plus the `isAuthenticatable` / `isRestorable` guards and the `UserDocument` type.
- **`./caller`** — `verifyOwnPassword` delegates auth-context resolution to `withOwnAccount`.
- **`@modules/account/services/index.ts`** — re-exports these functions as the public surface of the account services barrel.

## Notes

- The `email` parameter is typed `string | undefined` at the signature level; the actual type safety comes from the `LoginBody.safeParse` gate. The parsed value (`parseResult.data.email`) is what gets passed to `findForLogin`.
- `findForLogin` is the one `userService` query that selects the `select: false` password hash — all other flows must not touch it.
- `verifyOwnPassword` returning 422 is intentional: a 401 would trigger client-side "session expired" handlers and log out a still-valid session.
- An OAuth-only account (no stored password) hits the same 422 path as a wrong password in `verifyOwnPassword`; there is no separate "no password on file" status.
