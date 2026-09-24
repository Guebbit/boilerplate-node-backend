---
source: src/modules/account/controllers/delete-expired-tokens.ts
sha256: 2f04da7071a4aeb524aae5b0624484fb86bd3e122c9c416d7f57decfb90ecc9a
generated_at: 2026-09-23T17:59:24.521680+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-expired-tokens.ts

## Purpose

Thin HTTP adapter for `DELETE /account/tokens/expired`. Translates the request into a call to `accountService.adminTokenCleanup`, increments a cleanup metric on success, and shapes the response into the `MessageResponse` contract. Exists to keep the service layer free of Express-specific concerns.

## Key elements

- **`deleteExpiredTokens(request, response)`** — the sole export. Calls `accountService.adminTokenCleanup(callerContextOf(request))`, checks the result via `refused`, increments `authTokenCleanupTotal`, and sends a `successResponse` with no data payload.

## Relationships

- **`@infrastructure/http/controller`** — provides `catchAs` (error-to-response adapter) and `refused` (detects authorization/denial results to short-circuit before the success path).
- **`@infrastructure/http/request`** — `callerContextOf` extracts the authenticated caller's identity from the Express request to pass into the service.
- **`@infrastructure/http/response`** — `successResponse` builds the standard success envelope.
- **`../services` (`accountService`)** — the business-logic dependency; `adminTokenCleanup` performs the actual expired-token deletion.
- **`../metrics`** — `authTokenCleanupTotal` (a Counter) is incremented once per successful cleanup call.
- **`routes.ts`** — mounts this handler at the `DELETE /account/tokens/expired` path.

## Notes

- The pruned token count returned by the service is deliberately **not** included in the response body. The `MessageResponse` schema forbids a `data` field; the count is only used in the service's own audit/logging path.
- The metric increment happens *after* the `refused` check, so denied/failed calls do not count toward the cleanup total.
- Error handling is fully delegated to `catchAs(response, 'deleteExpiredTokens')`; there is no try/catch or manual error mapping in this file.
