---
source: src/modules/users/controllers/post-place-purchase-hold.ts
sha256: f6451c5b5339b86f48d4ec4e8a488217a160d52bb9972f96e8209858448989ca
generated_at: 2026-11-14T22:20:21.607643+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/post-place-purchase-hold.ts

## Purpose

HTTP controller for `POST /users/:id/place-purchase-hold`. It validates the request (user ID, body schema) and delegates the actual purchase-hold mutation to `userService.setPurchaseHold`, then shapes the successful response as an RFC 9110 §8.8.3 resource. The controller contains no domain logic.

## Key elements

- **`postPlacePurchaseHold`** (exported, named handler `"placeUserPurchaseHold"`) — the sole export. Pipeline:
  1. `requireId` extracts and validates the `:id` param.
  2. `parseBody(PlaceUserPurchaseHoldBody, …)` validates the JSON body (fields: `until`, `note`).
  3. Calls `userService.setPurchaseHold(id, { until: new Date(body.until), note }, caller)`.
  4. On refusal (403/404/409 etc.) short-circuits via `refused`.
  5. Maps the result through `userService.toUserContract`, sets resource headers via `answerAsResource`, and returns `successResponse(…, 200)`.
  6. Unhandled errors are funneled through `catchAs(response, 'placeUserPurchaseHold')`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/controller.ts` | Imports `namedHandler`, `parseBody`, `refused`, `catchAs` — the standard handler-wrapper toolkit. |
| `src/infrastructure/http/ids.ts` | `requireId` validates the `:id` URL parameter. |
| `src/infrastructure/http/preconditions.ts` | `answerAsResource` emits the resource-identifier response header. |
| `src/infrastructure/http/request.ts` | `callerContextOf` extracts the authenticated caller's identity/context from the request. |
| `src/infrastructure/http/response.ts` | `successResponse` writes the final 200 JSON body. |
| `src/modules/users/routes.ts` | Registers this handler on the `POST /users/:id/place-purchase-hold` route. |
| `src/modules/users/services/index.ts` | Provides the `userService` object; this controller calls its `setPurchaseHold` (domain logic + audit) and `toUserContract` (DTO mapping) methods. |

## Notes

- All domain-side concerns (404, 403 for staff accounts, audit-log row) live inside the service; this file is a thin I/O boundary.
- `body.until` arrives as a string and is coerced to `Date` here — the Zod schema does not perform the conversion.
- The response is **200** (not 201) because the endpoint replaces an existing hold state rather than creating a new resource.
- `answerAsResource` is called with the *resolved* user ID (`user.id`), not the raw path param, so the resource URI is canonical.
