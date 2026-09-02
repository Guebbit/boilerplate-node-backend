# src/modules/account/controllers/delete-2fa.ts

## Purpose

HTTP controller for `DELETE /account/2fa`. It validates the request body (a one-time code or backup code), then delegates to `accountService.disableTwoFactor`. The route guard handles session auth; this controller enforces the additional proof-of-knowledge requirement so a stolen-but-fresh session cannot simply disable 2FA.

## Key elements

- **`delete2fa`** (exported) — The sole export. Accepts an Express `Request`/`Response` pair, parses the body with the `DisableTwoFactorBody` Zod schema, extracts the authenticated user id and caller context, and calls `accountService.disableTwoFactor(id, code, callerContext)`. Emits a Prometheus counter (`authTwoFactorDisableTotal`) on both success and failure paths.

## Relationships

- **`@infrastructure/http/request`** — `authContextOf(request)` pulls the authenticated user id from the request; `callerContextOf(request)` captures caller metadata (IP, user-agent, etc.) passed into the service.
- **`@infrastructure/http/response`** — `successResponse` and `rejectResponse` shape the JSON reply.
- **`@infrastructure/http/controller`** — `rejectValidation` returns a 422 with Zod error details when the body fails schema parsing.
- **`@infrastructure/http/errors`** — `rejectDatabaseError` maps Mongoose `CastError` (or any thrown `Error`) to a consistent 500 payload.
- **`@modules/account/services/index`** — `accountService.disableTwoFactor` is the actual domain operation; this file contains no business logic beyond orchestration.
- **`@modules/account/metrics`** — `authTwoFactorDisableTotal` counter is incremented with `{ status: 'success' | 'failure' }` on every completed request.
- **`@modules/account/routes`** — Registers `delete2fa` as the handler for `DELETE /account/2fa` (with the critical-auth route guard).
- **`@types`** — `TwoFactorDisableRequest` types the Express body parameter.

## Notes

- The controller is promise-chain style (`.then`/`.catch`), not async/await. Follow this convention if editing.
- Validation failure and service-level failure both increment the same counter with `status: 'failure'`; only the actual success path increments with `status: 'success'`.
- The `id` argument to `disableTwoFactor` comes from the auth context (set by the route guard), **not** from the request body — the body only carries the `code` field.
- The 200 response body is `undefined` with a human-readable message string; there is no data payload.
