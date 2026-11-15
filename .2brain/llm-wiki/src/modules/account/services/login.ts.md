---
source: src/modules/account/services/login.ts
sha256: a4845300f38693edffa1531a75a6aa4121292234aaa7f9fcd4066beeb0ebdc60
generated_at: 2026-11-14T18:45:32.556768+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/login.ts

## Purpose

Password-verification service for two distinct flows: `login` (stranger proves credentials by email/password) and `verifyOwnPassword` (signed-in caller re-proves identity before a sensitive action). It deliberately does **not** mint a session—that responsibility belongs to the sibling `session` module.

## Key elements

- **`DUMMY_PASSWORD_HASH`** (module-level constant) — an argon2id hash of random bytes computed once at import time. Used as the verification target when the email lookup misses, so "unknown account" and "wrong password" cost identical CPU time.
- **`login(body: unknown)`** — validates the body against the `LoginBody` zod schema (422 on failure), looks up the user via `accountUserService.findForLogin`, verifies the password against the stored hash (or the dummy hash), and returns `ResponseSuccess<UserDocument>` or a 401 reject. Accounts in deletion-grace (`isRestorable`) are still returned so the caller can offer a restore.
- **`verifyOwnPassword(userId, password, wrongKey)`** — fetches the caller's own account via `withOwnAccount`, compares the supplied password to the stored hash, and returns 422 (never 401) on a mismatch or a missing password (OAuth-only account). The `wrongKey` parameter lets each caller supply its own i18n rejection message.

## Relationships

- **`src/modules/users/friends/account.ts`** — imports `accountUserService` to load the user row (including the `select:false` password field) for login verification.
- **`src/modules/users/index.ts`** — imports `isAuthenticatable`, `isRestorable`, and the `UserDocument` type for post-verification state checks.
- **`src/infrastructure/security/password-hash.ts`** — calls `verifyPassword` (per-request) and `hashPasswordSync` (once, at import, for the dummy hash).
- **`src/infrastructure/http/response.ts`** — shapes every return value via `generateSuccess` / `generateReject` / `validationErrors` and uses the `ResponseSuccess` / `ResponseReject` types.
- **`src/infrastructure/http/errors.ts`** — funnels database-level failures through `rejectDatabaseEnvelope('auth', error)`.
- **`src/infrastructure/i18n/index.ts`** — resolves user-facing error strings via `t(key)`.
- **`src/modules/account/services/caller.ts`** — uses `withOwnAccount` to load the signed-in caller's record inside `verifyOwnPassword`.

## Notes

- **Timing-oracle guard:** the dummy-hash comparison is intentional; removing the `user?.password ?? DUMMY_PASSWORD_HASH` fallback would let an attacker enumerate registered addresses by response time.
- **422 vs 401 in `verifyOwnPassword`:** a 401 here would be indistinguishable from "session expired" to a client interceptor and could force an unwanted logout. 422 is the contract.
- **`password` is `select:false`** on the user model; the lookup in `login` is one of the few queries that deliberately opts in. Do not add ad-hoc `.select('password')` elsewhere.
- **Restorable accounts:** `login` returns them on a valid credential match. The *caller* (not this module) decides whether to offer restore or reject.
