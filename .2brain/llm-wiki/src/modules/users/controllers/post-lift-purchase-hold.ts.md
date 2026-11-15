---
source: src/modules/users/controllers/post-lift-purchase-hold.ts
sha256: 20650690b439c68769391b9de19a4c3ba2ba6c85cf193cfb01b35e861a446bd2
generated_at: 2026-11-14T22:20:02.930802+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/post-lift-purchase-hold.ts

## Purpose

Thin Express controller for `POST /users/:id/lift-purchase-hold`. It validates the path parameter, delegates all business logic to `userService.liftPurchaseHold`, serializes the returned user, and sends a 200 response. It exists so the route table can wire a named, catch-wrapped handler without inlining logic.

## Key elements

- **`postLiftPurchaseHold`** (exported const) — The single handler, wrapped in `namedHandler('liftUserPurchaseHold', …)`. Steps:
  1. Extracts `:id` via `requireId` (returns early with 404 if missing).
  2. Calls `userService.liftPurchaseHold(id, callerContext)`.
  3. If the service signals a refusal (e.g. hold already cleared), short-circuits via `refused`.
  4. Serializes with `userService.toUserContract(…, caller)`.
  5. Emits the resource link (`/users/:id`) via `answerAsResource` and the body via `successResponse(…, 200)`.
  6. Catches any unexpected error through `catchAs(response, 'liftUserPurchaseHold')`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/controller.ts` | Provides `namedHandler`, `refused`, `catchAs` — the structural wrapper around every handler in this module. |
| `src/infrastructure/http/ids.ts` | `requireId` extracts and validates the `:id` route param. |
| `src/infrastructure/http/preconditions.ts` | `answerAsResource` sets the `Link` header (`rel="self"`) per RFC 9110. |
| `src/infrastructure/http/request.ts` | `callerContextOf` derives the authenticated caller context from the request. |
| `src/infrastructure/http/response.ts` | `successResponse` writes the JSON body and status code. |
| `src/modules/users/routes.ts` | Registers `postLiftPurchaseHold` on the `POST /users/:id/lift-purchase-hold` route. |
| `src/modules/users/services/index.ts` | Exports `userService`, whose `liftPurchaseHold` method owns the 404, 403 (staff account), and audit-row logic; `toUserContract` shapes the response payload. |

## Notes

- The controller contains **no** business rules. 404, 403, and audit logging are all handled inside `userService.liftPurchaseHold` (stated in the doc-comment).
- `callerContextOf(request)` is called twice — once for the service invocation and once for serialization. Both calls return the same object; the duplication is incidental, not a re-fetch.
- The `refused` check (a service-level "no-op" signal, e.g. hold was not active) is handled *before* serialization, so the response is whatever `refused` writes rather than a 200.
- The `namedHandler` name `'liftUserPurchaseHold'` is the tag that appears in error/trace logs from `catchAs`.
