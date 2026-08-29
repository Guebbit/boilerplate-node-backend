# src/modules/account/controllers/delete-expired-tokens.ts

## Purpose

Express controller handler for `DELETE /account/tokens/expired`. Performs an admin-only bulk purge of expired tokens (primarily stale refresh tokens) and returns the shared `Success` response. Exists so a scheduler or operator can invoke periodic cleanup of the token store.

## Key elements

- **`deleteExpiredTokens(request, response)`** — Exported handler. Calls `accountService.adminTokenCleanup(callerContextOf(request))`, checks the result for a refusal, increments the `authTokenCleanupTotal` Prometheus counter, and sends a `successResponse` (status + message only, no `data` body).

## Relationships

- **`@infrastructure/http/controller`** — Imports `catchAs` (uniform error → response mapping) and `refused` (checks whether the service result signals an authorization refusal before proceeding).
- **`@infrastructure/http/request`** — Imports `callerContextOf` to extract the authenticated caller's context and pass it into the service call.
- **`@infrastructure/http/response`** — Imports `successResponse` to build the standard success envelope.
- **`src/modules/account/metrics.ts`** — Imports `authTokenCleanupTotal` counter; incremented once per successful cleanup.
- **`src/modules/account/services/index.ts`** — Imports `accountService`; calls its `adminTokenCleanup` method which performs the actual DB deletion and returns `{ status, message, /* pruned count */ }`.
- **`src/modules/account/routes.ts`** — Registers this handler at the `DELETE /account/tokens/expired` route.

## Notes

- The pruned-document count returned by `adminTokenCleanup` is **deliberately omitted** from the HTTP response body. The `MessageResponse` schema declares `additionalProperties: false` with no `data` field, so including it would violate the contract. The count is meant for the audit record / log line, not the wire.
- Admin authorization is enforced inside the service layer (`adminTokenCleanup`), not in this controller. A refusal at the controller level is handled by `refused()` short-circuiting before the success path.
