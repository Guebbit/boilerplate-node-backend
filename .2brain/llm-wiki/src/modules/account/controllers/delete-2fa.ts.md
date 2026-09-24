---
source: src/modules/account/controllers/delete-2fa.ts
sha256: 7f76fa0aa9f710b04563b5993b7fdd12104f0732582f000431fb8940f8979ee9
generated_at: 2026-09-23T17:58:52.101498+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-2fa.ts

## Purpose

Thin HTTP adapter for `DELETE /account/2fa`. Validates the request body against the `DisableTwoFactorBody` zod schema, then delegates to `twoFactorService.disableTwoFactor` to drop all armed factors and backup codes. Emits a Prometheus counter and returns an i18n-localised success or error response.

## Key elements

- **`delete2fa`** _(exported)_ — Express controller handler. Extracts the user id from `request.authContext`, validates the body (code or backup code), calls `twoFactorService.disableTwoFactor`, and maps the result to an HTTP response. Increments `authTwoFactorDisableTotal` on both success and failure paths.
- **`DisableTwoFactorBody.safeParse`** — Non-throwing zod validation of the JSON body; failures short-circuit via `rejectValidation`.
- **`authTwoFactorDisableTotal.inc`** — Metrics counter labelled `{ method: 'all', status: 'success' | 'failure' }`, incremented before every response return.
- **`t('account.two-factor.disabled')`** — i18n message returned as the success body.

## Relationships

- **`src/modules/account/services/index.ts`** — Source of `twoFactorService.disableTwoFactor`, the business-logic call this controller wraps.
- **`src/modules/account/routes.ts`** — Wires this controller to the `DELETE /account/2fa` path and enforces the critical-auth guard (not present in this file).
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` and `rejectResponse` for building HTTP replies.
- **`src/infrastructure/http/controller.ts`** — Provides `rejectValidation` for the schema-failure path.
- **`src/infrastructure/http/errors.ts`** — Provides `rejectDatabaseError` for the `.catch` fallback.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)`, extracted and forwarded into the service call.
- **`src/infrastructure/i18n/index.ts`** — Provides `t` for the localised success message.
- **`src/modules/account/metrics.ts`** — Source of the `authTwoFactorDisableTotal` counter.
- **`src/types/index.ts`** — Source of the `TwoFactorCodeRequest` type used in the Express `Request` generic.

## Notes

- `request.authContext!` uses a non-null assertion; the file trusts that the route guard in `routes.ts` has already populated it. There is no local guard here.
- The success status code is explicitly `200` (not `204`), with a `null`-ish body (`undefined`) and an i18n string — clients should expect a 200 with a message, not an empty body.
- The metric label `method: 'all'` is hardcoded in this controller; if other endpoints track this counter with different `method` values, this one will always appear as `'all'`.
