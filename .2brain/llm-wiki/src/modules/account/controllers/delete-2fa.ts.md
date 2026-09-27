---
source: src/modules/account/controllers/delete-2fa.ts
sha256: cf0fd8f34ecd955e5e9069f9a42e7ae8a380775a4e87812beecd3c83d0a4743e
generated_at: 2026-09-27T14:22:29.493451+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-2fa.ts

## Purpose

Single-handler controller for `DELETE /account/2fa`. Validates the incoming code (or backup code) from the request body, then delegates to `twoFactorService.disableTwoFactor` to remove all armed two-factor factors and their backup codes for the authenticated user.

## Key elements

- **`delete2fa`** (exported) — Express handler. Parses the body with the `DisableTwoFactorBody` Zod schema, calls `twoFactorService.disableTwoFactor(id, code, callerContext)`, and responds with a 200 + i18n message on success, a 4xx on validation/business refusal, or a 5xx via the `catchAs` fallback. Increments `authTwoFactorDisableTotal` with `status: 'success'` or `'failure'` on every path.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies the `rejectValidation`, `refused`, and `catchAs` response helpers used for all three error/success branches.
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf(request)` to extract the caller context passed into the service.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` for the 200 reply.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — provides `t()` for the localized `"account.two-factor.disabled"` message.
- **`src/modules/account/services/index.ts`** — source of `twoFactorService.disableTwoFactor`, the actual business logic.
- **`src/modules/account/metrics.ts`** — source of the `authTwoFactorDisableTotal` Prometheus counter.
- **`src/modules/account/routes.ts`** — mounts `delete2fa` on the `DELETE /account/2fa` route (including the fresh-auth route guard mentioned in the doc comment).
- **`src/types/index.ts`** — provides the `TwoFactorCodeRequest` type used to type the Express request body.

## Notes

- Security double-gate: the doc comment states the route guard enforces fresh critical auth **and** the body must contain a valid code/backup code. Both are required; the body check is the guard against a stolen-but-still-fresh session.
- Metrics are always tagged `method: 'all'` — there is no per-method breakdown in this handler (unlike some sibling controllers that track OTP vs. backup-code separately).
- The success response body is `undefined`; only the i18n message string is meaningful to the client.
