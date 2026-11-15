---
source: src/modules/delivery/controllers/post-process-order.ts
sha256: 40f00ae6e5622cb415acd17872891ec44d6a93e699542c30bfa10487f9ba2693
generated_at: 2026-11-14T19:38:31.862835+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-process-order.ts

## Purpose

HTTP controller handler for `POST /orders/:id/process`. It is the single endpoint that transitions an order from `paid` to `processing`, called by staff to signal that fulfillment has begun — before any parcel or shipment record exists.

## Key elements

- **`postProcessOrder`** (exported const) — Express handler that:
  1. Validates and extracts the `:id` route param via `requireId`.
  2. Delegates to `deliveryService.processOrder(orderId, authContext, callerContext)`.
  3. If the service returns a refusal, short-circuits via `refused()`.
  4. Otherwise sets the resource link (`/orders/:id`) and sends the updated `Order` in the response body.
  5. Catches and maps any thrown error through `catchAs()`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `catchAs` (async error → HTTP mapping) and `refused` (service-refusal → HTTP short-circuit).
- **`src/infrastructure/http/ids.ts`** — provides `requireId`, which reads and validates the `:id` param, sending a 400/404 if missing or malformed.
- **`src/infrastructure/http/preconditions.ts`** — provides `answerAsResource` to emit the canonical resource `Link` header on the response.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf` to extract audit/caller metadata from the request.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for consistent JSON response formatting.
- **`src/modules/delivery/order-routes.ts`** — route registration file that wires this handler to `POST /orders/:id/process`.
- **`src/modules/delivery/services/index.ts`** — exports `deliveryService`; the actual `processOrder` business logic (state transition, validation) lives there.
- **`src/types/index.ts`** — supplies the `Order` type used in the response generic.

## Notes

- The module doc-comment calls this "the one door" for `paid → processing`; no other endpoint performs this transition.
- The resource link uses the order's own id (`/orders/${result.data.id}`), not the incoming request URL — intentional per RFC 9110.
- Early-return path (`if (!orderId) return Promise.resolve()`) relies on `requireId` having already written the error response; the handler must not fall through to `deliveryService`.
- `refused()` is checked *before* `answerAsResource`/`successResponse`, so a refused result produces no `Link` header and no body beyond what `refused` itself sends.
