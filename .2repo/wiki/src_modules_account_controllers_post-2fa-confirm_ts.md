# src/modules/account/controllers/post-2fa-confirm.ts

## Purpose

Thin HTTP adapter for `POST /account/2fa/confirm`. It validates the request body, delegates to `accountService.confirmTwoFactor`, and shapes the response. No business logic lives here.

## Key elements

- **`post2faConfirm`** (exported) — The sole controller function. Accepts an Express `Request`/`Response` pair, extracts the authenticated user `id` via `authContextOf`, validates `request.body` against the `ConfirmTwoFactorBody` zod schema, then calls `accountService.confirmTwoFactor(id, code, callerContext)`. On success it returns the result (including one-time backup codes) with status 200; on failure it dispatches the appropriate rejection helper.
- **`authTwoFactorEnrollTotal`** (imported from `../metrics`) — Prometheus counter incremented with `{ status: 'success' | 'failure' }` on every code path that terminates the request.

## Relationships

- **`src/infrastructure/http/response.ts`** — `successResponse` and `rejectResponse` are the only ways this controller writes an HTTP reply.
- **`src/infrastructure/http/controller.ts`** — `rejectValidation` handles the zod-parse-failure path.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseError` is the `.catch` handler for Mongoose/DB-level errors.
- **`src/infrastructure/http/request.ts`** — `authContextOf` and `callerContextOf` extract the user ID and caller metadata from the request.
- **`src/modules/account/services/index.ts`** — `accountService.confirmTwoFactor` performs the actual secret verification and secret arming.
- **`src/modules/account/metrics.ts`** — supplies the `authTwoFactorEnrollTotal` counter.
- **`src/types/index.ts`** — provides the `TwoFactorConfirmRequest` type used in the Express generic on the handler signature.
- **`src/modules/account/routes.ts`** — registers this handler on the `POST /account/2fa/confirm` route.

## Notes

- The function uses `.then().catch()` rather than `async/await`; the catch signature is explicitly `CastError | Error` to cover Mongoose casting failures.
- The response message on success is hard-coded (`'Two-factor authentication is now on.'`) and the status is always 200, not 201.
- Backup codes in `result.data` are returned once and (per the module doc comment) never re-fetchable; clients must persist them.
- Metrics are incremented *before* the response is sent on every path (validation failure, service failure, service success), so the counter is not a pure "completed enrollment" signal—it counts attempts by outcome.
