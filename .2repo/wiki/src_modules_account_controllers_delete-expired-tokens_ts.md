# src/modules/account/controllers/delete-expired-tokens.ts

## Purpose

Thin HTTP adapter for `DELETE /account/tokens/expired`. Wires the Express route to `accountService.adminTokenCleanup`, records a success metric, and formats the response — no business logic lives here.

## Key elements

- **`deleteExpiredTokens(request, response)`** – The sole export; the Express handler for the endpoint.
  - Extracts caller identity via `callerContextOf(request)` and passes it to `accountService.adminTokenCleanup`.
  - On a `refused` result (e.g. non-admin caller), short-circuits without incrementing the metric.
  - On success, increments `authTokenCleanupTotal` and replies with `successResponse(response, undefined, result.status, result.message)`.
  - Catches and maps any thrown error through `catchAs(response, 'deleteExpiredTokens')`.

## Relationships

- **`src/modules/account/services/index.ts`** – Imports `accountService`; calls its `adminTokenCleanup(caller)` method for the actual cleanup work.
- **`src/infrastructure/http/controller.ts`** – Imports `catchAs` (error-to-HTTP mapping) and `refused` (permission-denial short-circuit).
- **`src/infrastructure/http/request.ts`** – Imports `callerContextOf` to derive the authenticated caller's context from the Express `Request`.
- **`src/infrastructure/http/response.ts`** – Imports `successResponse` to emit the standard `MessageResponse` envelope.
- **`src/modules/account/metrics.ts`** – Imports `authTokenCleanupTotal` (a Prometheus counter) and calls `.inc()` once per successful cleanup.
- **`src/modules/account/routes.ts`** – Registers this handler on the `DELETE /account/tokens/expired` route (inferred from the module doc-comment).

## Notes

- The pruned-token count returned by the service is intentionally **not** included in the HTTP body. The `MessageResponse` schema forbids a `data` field; including it would break the API contract. The count is available only in audit logs.
- The metric is incremented **only** when the operation succeeds (i.e. after the `refused` check passes), so it reflects completed cleanups, not attempts.
