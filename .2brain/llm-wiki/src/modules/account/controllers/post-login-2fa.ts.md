---
source: src/modules/account/controllers/post-login-2fa.ts
sha256: d1c3428b5073bffb8b744a6cd536a8f6b9158a4a5cd3f89dd35930ac29958134
generated_at: 2026-09-23T18:02:17.658336+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-login-2fa.ts

## Purpose

Second step of the 2FA login flow. Receives the `challenge` + `code` pair returned by `POST /account/login` when `mfaRequired` is true, delegates verification to the two-factor service, and on success mints a full session with `amr` augmented by `'otp'`.

## Key elements

- **`postLoginTwoFactor`** (exported function) — The sole export. An Express handler that:
    1. Zod-validates the body via `LoginTwoFactorBody.safeParse`.
    2. Resolves the challenge from the request body **or** falls back to the MFA challenge cookie (OAuth-originated challenges are never sent to the client in-band; see `oauth/mfa-redirect.ts`).
    3. Calls `twoFactorService.verifyLoginChallenge(challenge, code, callerContextOf(request))`.
    4. On success, calls `issueSession` with `[...amr, 'otp']`, reads the user's tenant roles fresh via `rolesOf`, records the metric and observability event, destroys the MFA cookie, and returns `{ token }` (200).
    5. On any failure path, increments `authTwoFactorChallengeTotal` with `status: 'failure'` and returns an appropriate error response.

## Relationships

| Neighbor                                       | Interaction                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@infrastructure/http/response`                | `successResponse` / `rejectResponse` for all HTTP replies.                                                    |
| `@infrastructure/http/errors`                  | `rejectDatabaseError` in the `.catch` handler.                                                                |
| `@infrastructure/http/controller`              | `rejectValidation` when Zod parsing fails.                                                                    |
| `@infrastructure/http/request`                 | `callerContextOf` to extract tenant/user context for the service call.                                        |
| `@infrastructure/i18n`                         | `t()` for the "challenge invalid" error message.                                                              |
| `@kernel/permissions`                          | `isUnrestrictedRole` to feed the observability record.                                                        |
| `@modules/access`                              | `rolesOf(userId, DEPLOYMENT_TENANT_ID)` — reads the user's tenant membership roles at response time.          |
| `@kernel/access/tenant`                        | `DEPLOYMENT_TENANT_ID` constant for the membership lookup.                                                    |
| `@modules/account/metrics`                     | `authTwoFactorChallengeTotal` counter (success/failure).                                                      |
| `@modules/account/session/login-observability` | `recordLoginSuccess` for post-auth audit/telemetry.                                                           |
| `@modules/account/oauth/mfa-redirect`          | `readMfaChallengeCookie` (fallback challenge source) and `destroyMfaChallengeCookie` (cleanup after success). |
| `@modules/account/services/index.ts`           | `twoFactorService.verifyLoginChallenge` — the actual code/backup-code verification.                           |

## Notes

- **Challenge source is dual-path.** A password-originated challenge is always in the request body; an OAuth-originated one is stored only in a cookie (never sent to the client). The `??` fallback handles both. If neither is present, the handler 401s before any service call.
- **`amr` is an array by design.** The `'otp'` value is appended to whatever `amr` the service returns. Downstream guards that require a second factor check for `'otp'` in that array — no separate flag is stored.
- **Roles are read fresh, not from the user document.** `rolesOf` hits the membership collection at response time because the user document itself carries no role field.
- **Code-vs-backup-code ambiguity is intentionally not resolved here.** The controller passes the raw `code` string to the service and treats the result opaquely.
