---
source: src/modules/delivery/controllers/post-deliver-shipment.ts
sha256: f3198b90814e991e5a97c2b0a79cb2ebd82187dfc4cb5e94a1aaaee0cea58bcb
generated_at: 2026-11-08T05:27:12.781118+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-deliver-shipment.ts

## Purpose

Handler for `POST /delivery/shipments/:id/deliver`. It lets staff mark a shipment as delivered; when the *last* pending shipment for an order is delivered, the order transitions `shipped → delivered` (logic lives in the service layer).

## Key elements

- **`postDeliverShipment(request, response)`** (exported) — The sole export. Validates the `:id` param, delegates to `deliveryService.deliverShipment(id, authContext, callerContext)`, then either short-circuits via `refused` or writes a `successResponse<Shipment>`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` (error serialization) and `refused` (rejection short-circuit).
- **`src/infrastructure/http/ids.ts`** — Provides `requireId` to extract and validate the route param.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to derive the acting user's context for the service call.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` to emit the JSON body.
- **`src/modules/delivery/services/index.ts`** — Source of `deliveryService.deliverShipment`; the actual domain work (state transitions, persistence) happens there.
- **`src/modules/delivery/routes.ts`** — Registers `postDeliverShipment` as the handler for the deliver route.
- **`src/types/index.ts`** — Supplies the `Shipment` type used in the response generic.

## Notes

- The controller is intentionally thin: no domain logic, no DB access. All shipment/order state rules live in `deliveryService.deliverShipment`.
- Uses the early-return pattern (`if (!id) return Promise.resolve()`) so the service is never called with a missing ID.
- The Express generic on `Request` is `{ id?: string }` — the param is optional at the type level because `requireId` handles the 404 case before execution continues.
