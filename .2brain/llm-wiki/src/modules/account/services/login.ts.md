---
source: src/modules/account/services/login.ts
sha256: 59b3b2c245c87f2b587592d3e21422197123c2d11defe632c353ada73a07f2fa
generated_at: 2026-10-14T08:49:04.313123+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/login.ts

## Purpose

Password-verification endpoints for the account domain. `login` authenticates a stranger by email/password; `verifyOwnPassword` re-confirms a signed-in caller's password before a sensitive action. Neither function creates a session — that responsibility belongs to `../session/session`.

## Key elements

- **`DUMMY_PASSWORD_HASH`** — Module-level `argon2id` hash of a random 32-byte value, computed once at import time. Used as the comparison target when no matching user is found, so the unknown-email path costs the same as a wrong-password path (timing-oracle mitigation).
- **`login(email?, password?)`** — Validates input via `LoginBody` (Zod), looks up the user through `userService.findForLogin`, then calls `verifyPassword`. Returns `ResponseSuccess<UserDocument>` or `ResponseReject` (422 for bad input, 401 for bad credentials).
- **`verifyOwnPassword(userId, password, wrongKey)`** — Looks up the user via `userService.findByIdWithCredentials`, verifies the supplied password against the stored hash. Returns 401 if the user is gone, 422 if the password is missing (OAuth-only account) or incorrect. `wrongKey` is a caller-supplied i18n key for the rejection message.

## Relationships

- **`@infrastructure/i18n`** — Calls `t()` for localized rejection messages (`account.login.wrong-data` in `login`; the caller-provided `wrongKey` in `verifyOwnPassword`).
- **`@infrastructure/security/password-hash`** — Uses `hashPasswordSync` (once, at module load) and `verifyPassword` (per request) for all hash comparisons.
- **`@infrastructure/http/response`** — All return values are shaped through `generateSuccess`, `generateReject`, and `validationErrors`; the public contract is `ResponseSuccess<UserDocument> | ResponseReject`.
- **`@infrastructure/http/errors`** — The `.catch` in `login` wraps unexpected errors via `rejectDatabaseEnvelope('auth', error)`.
- **`@modules/users`** — Depends on `userService.findForLogin` and `userService.findByIdWithCredentials` to retrieve the `UserDocument` (including the `select:false` password field). This file is one of the few consumers that legitimately needs the password column.
- **`@modules/account/services/index.ts`** — Re-exports this module so callers can import from the services barrel.

## Notes

- **422 vs 401 in `verifyOwnPassword`:** A 401 here would be intercepted by client-side auth middleware as "session expired" and log out a still-valid session. 422 is intentional.
- **No session minting:** Callers must chain this with the session service; this file only proves the password.
- **`wrongKey` pattern:** Each caller (password-change, sensitive action gate, etc.) passes its own i18n key so the user-facing message matches that flow's contract rather than a generic "wrong password."
- **Timing side-channel:** The `DUMMY_PASSWORD_HASH` comparison ensures the unknown-email branch still performs one full `argon2id` verify. Removing it (e.g., early-returning 401 before `verifyPassword`) re-exposes the registered-address oracle.
