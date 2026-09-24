---
source: src/modules/delivery/controllers/post-ship-order.ts
sha256: 3fec388611c5b316454e5420c99bb2388d19ce02379b2f75c194325513e3abf2
generated_at: 2026-09-23T18:35:44.243458+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-ship-order.ts

## Purpose

HTTP handler for `POST /delivery/order/:orderId/ship`. It validates the inbound request body, delegates the actual state transition (`processing → shipped`) to the delivery service, and formats the success or rejection response. It exists so the route layer can stay thin and this single concern (shipping an order) lives in one testable function.

## Key elements

- **`postShipOrder`** (exported) — The only export. Accepts an Express `Request<{ orderId?: string }>` and `Response`. Steps:
    1. Validates `request.body` against the `ShipOrderBody` Zod schema via `parseBody`; early-returns on failure.
    2. Calls `deliveryService.recordShipment(orderId, trackingCode, callerContext, forced, reason)`.
    3. Responds with `successResponse<Shipment>` on success, or `refused` on a domain-level rejection.
    4. Catches unexpected errors with `catchAs`.

## Relationships

| Neighbor                                | Interaction                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/modules/delivery/service.ts`       | Calls `deliveryService.recordShipment` — the sole business-logic dependency.                    |
| `src/modules/delivery/routes.ts`        | Registers `postShipOrder` as the handler for the `POST /delivery/order/:orderId/ship` route.    |
| `src/infrastructure/http/controller.ts` | Provides the `parseBody`, `refused`, and `catchAs` helpers used throughout.                     |
| `src/infrastructure/http/request.ts`    | Provides `callerContextOf` to extract the authenticated caller's identity for the service call. |
| `src/infrastructure/http/response.ts`   | Provides `successResponse` for the 200/201 reply.                                               |
| `src/types/index.ts`                    | Imports the `Shipment` type used as the success payload.                                        |

## Notes

- The route parameter `orderId` is typed as **optional** (`orderId?: string`) in the handler signature, yet the body casts it unconditionally with `String(request.params.orderId)`. The route layer is expected to always supply a value; there is no runtime guard here.
- The handler uses a `.then`/`.catch` chain rather than `async/await` — consistent with the `catchAs` helper's design.
- `body.forced` and `body.reason` are passed through to the service, implying the service enforces (or relaxes) domain invariants on its own; the controller performs no business-logic checks beyond schema validation.
- The Zod schema (`ShipOrderBody`) is imported from `@api/schemas.zod`, keeping the controller decoupled from the service's internal types.
