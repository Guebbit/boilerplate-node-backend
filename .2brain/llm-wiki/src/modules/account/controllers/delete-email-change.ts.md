---
source: src/modules/account/controllers/delete-email-change.ts
sha256: f259517bab91478835ad50c7e6a592212c17fc8d51386ff32efa0c7e8acd9b51
generated_at: 2026-11-14T18:30:56.349327+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-email-change.ts

## Purpose

Thin HTTP adapter for the `DELETE /account/email-change` endpoint. It extracts the authenticated user's ID and caller context from the request, delegates to `accountService.cancelPendingEmailChange`, and maps the result to an appropriate HTTP response (204 on success, 409 on refusal, or an error status via `catchAs`).

## Key elements

- **`cancelPendingEmail`** *(exported handler)* — Express route handler for `DELETE /account/email-change`. Reads `request.authContext!.id`, calls `accountService.cancelPendingEmailChange(id, callerContextOf(request))`, then:
  - If `refused(response, result)` is truthy → returns early (the 409 path).
  - Otherwise sends `noContentResponse` (204).
  - On rejection, delegates to `catchAs(response, 'cancelPendingEmail')`.

## Relationships

- **`src/infrastructure/http/response.ts`** — uses `noContentResponse` for the 204 success reply.
- **`src/infrastructure/http/controller.ts`** — uses `refused` (409 short-circuit) and `catchAs` (error serialization) to shape responses without inline try/catch.
- **`src/infrastructure/http/request.ts`** — uses `callerContextOf(request)` to derive the caller context object passed into the service call.
- **`src/modules/account/services/index.ts`** — imports `accountService` from this barrel module and delegates the business logic to it.
- **`src/modules/account/routes.ts`** — the route file that registers this handler on the `DELETE /account/email-change` path.

## Notes

- The JSDoc explicitly states that *requesting the current address is a 409, not an implicit cancel*. The `refused` branch in the handler is the mechanism for that 409. See `docs/modules/account.md#proving-an-address` for the design rationale.
- The handler uses a non-null assertion (`request.authContext!`), so it assumes an upstream auth middleware has already populated it. No guard is present here.
- Success is 204 (No Content), not 200 — there is no response body by contract.
