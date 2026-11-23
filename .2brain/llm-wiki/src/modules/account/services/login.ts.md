---
source: src/modules/account/services/login.ts
source_sha256: 1e27be37aed5fd7699180fc6be72a6266386d3ef8fcc9aa76ced4251c46c904d
context_sha256: 2691c8f14fb7e82d0694cf9f475eef30f999eba77c43158e5103719581c0dc03
generated_at: 2026-11-22T03:37:56.662597+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/login.ts

## Purpose
Password verification for the account module. `login` authenticates a stranger by email/password; `verifyOwnPassword` re-confirms the password of an already signed-in caller before a sensitive action. Neither creates a session (that lives in `../session/session`).

## Key elements
- **`DUMMY_PASSWORD_HASH`** (module constant): an argon2id hash of random bytes, computed once at import via `hashPasswordSync`. Used so an unknown email still pays the hash cost, closing a timing oracle for email enumeration.
- **`login(body: unknown)`**: parses `body` against the strict `LoginBody` zod schema (failure → 422 with `validationErrors`). Then looks up the user by email through `accountUserService.findForLogin` (the only flow needing the `select:false` `password` field) and runs `verifyPassword` against the user's hash, or the dummy hash if no user was found. Returns a 401 (`account.login.wrong-data`) if the user is missing, the password mismatches, or the user is neither `isAuthenticatable` nor `isRestorable`. Otherwise returns `generateSuccess(user)`. Any thrown error goes to `rejectDatabaseEnvelope('auth', error)`.
- **`verifyOwnPassword(userId, password, wrongKey)`**: loads the caller's account via `withOwnAccount`. Returns 422 with `t(wrongKey)` if the account has no stored password (e.g. OAuth-only) or the password doesn't match. Otherwise returns the user.

## Relationships
- `src/infrastructure/security/password-hash.ts`: provides `hashPasswordSync` and `verifyPassword`.
- `src/infrastructure/http/response.ts`: provides `generateSuccess`, `generateReject` and `validationErrors`, plus the `ResponseSuccess`/`ResponseReject` types.
- `src/infrastructure/http/errors.ts`: `rejectDatabaseEnvelope` maps unexpected errors in `login`.
- `src/infrastructure/i18n/index.ts`: `t` produces the localized rejection messages.
- `src/modules/users/index.ts`: supplies `isAuthenticatable`, `isRestorable` and the `UserDocument` type.
- `src/modules/users/friends/account.ts`: exports `accountUserService`, used by `login` to look up the user by email.
- `src/modules/account/services/caller.ts`: `withOwnAccount` loads the caller's own user for `verifyOwnPassword`.

## Notes
- The user returned by `login` may be in its deletion grace period (`isRestorable`). The caller is expected to offer a restore instead of creating a session. An account whose grace has expired since the query is rejected as a wrong password.
- Strict `LoginBody` means unknown keys yield a 422, which the caller records as a failure.
- `verifyOwnPassword` deliberately uses 422, never 401. A 401 would look like an expired session to a client interceptor and log out a still-valid session.
- The comparison against the dummy hash must not be short-circuited. An early return on a missing user would reintroduce the timing gap.
