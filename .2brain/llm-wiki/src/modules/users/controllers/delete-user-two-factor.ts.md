---
source: src/modules/users/controllers/delete-user-two-factor.ts
sha256: 4055a65ef5474fe37f1a0c49eb213ac8e9775441d5c77ca1f07e0336f4c36867
generated_at: 2026-09-27T15:36:18.002762+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/delete-user-two-factor.ts

## Purpose

Thin HTTP adapter for `DELETE /users/:id/2fa` — the admin-assisted path that strips a user's second factor without requiring a verification code. All business logic lives in the service; this file only maps the request to a service call and the result to an HTTP response.

## Key elements

- **`deleteUserTwoFactor`** (exported) — Express handler. Reads `:id` from route params, calls `userService.adminDisableTwoFactor(id, callerContextOf(request))`, then:
  - Returns early if `refused(response, result)` indicates a domain-level rejection (e.g. user not found, already disabled).
  - Otherwise sends `successResponse` with status 200 and the localized message `t('users.two-factor-disabled')`.
  - On any thrown error, delegates to `catchAs(response, 'deleteUserTwoFactor')` for uniform error serialization.

## Relationships

- **`src/modules/users/routes.ts`** — registers this handler on the `DELETE /users/:id/2fa` route behind the admin-only gate; this file contains no auth check of its own.
- **`src/modules/users/service.ts`** — provides `userService.adminDisableTwoFactor`, which performs the actual 2FA removal and audit logging.
- **`src/infrastructure/http/controller.ts`** — supplies `refused` (domain-rejection short-circuit) and `catchAs` (error → HTTP mapping) helpers.
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf` to extract the acting admin's identity for service-level auditing.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` for the 200 reply.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — supplies `t()` for the localized success message.

## Notes

- This is the one **deliberate bypass** of the "prove the factor to remove it" rule. The self-service equivalent (`DELETE /account/2fa`) requires a code; this path does not.
- Authorization (admin-only) is enforced by the router, not here. Do not add an auth check in this file.
- Audit logging is the service's responsibility, not the controller's — the controller passes `callerContextOf(request)` so the service can record *who* bypassed.
- The `catchAs` tag string (`'deleteUserTwoFactor'`) is used for error categorization in logs/metrics; keep it in sync if you rename the export.
