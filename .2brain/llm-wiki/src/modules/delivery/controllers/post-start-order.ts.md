---
source: src/modules/delivery/controllers/post-start-order.ts
sha256: 71621964fe3eb146a0bcc730801d18b7818ecc59150523d80b28c01caf10cff7
generated_at: 2026-10-14T15:22:01.451686+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/post-start-order.ts

## Purpose

Controller handler for `POST /delivery/order/:orderId/start`. It is the single endpoint that transitions a paid delivery order into the `processing` state (fulfilment start), called by staff before any parcel is yet recorded.

## Key elements

- **`postStartOrder`** (exported) – Express route handler. Validates `orderId` from the URL param, delegates to `deliveryService.startFulfilment`, then either writes a success body or a refusal based on the service result.
- **Validation gate** – `requireId` extracts and checks the `orderId` param; on failure it sends a 404 and the handler returns early (`Promise.resolve()`).
- **Service call** – `deliveryService.startFulfilment(orderId, request.authContext, callerContextOf(request))` performs the actual state transition.
- **Response shaping** – `refused` short-circuits on a rejection; `successResponse<Order>` serialises the happy path; `catchAs` wraps the `.catch` with a named error label.

## Relationships

- **`src/modules/delivery/routes.ts`** – registers `postStartOrder` as the handler for the `POST /delivery/order/:orderId/start` route.
- **`src/modules/delivery/services/index.ts`** – provides `deliveryService.startFulfilment`, the business logic this controller delegates to.
- **`src/infrastructure/http/controller.ts`** – supplies `catchAs` (unified error catcher) and `refused` (rejection responder).
- **`src/infrastructure/http/ids.ts`** – supplies `requireId` for safe URL-param extraction.
- **`src/infrastructure/http/request.ts`** – supplies `callerContextOf` to derive an audit/caller context from the request.
- **`src/infrastructure/http/response.ts`** – supplies `successResponse` for consistent 200 envelopes.
- **`src/types/index.ts`** – provides the `Order` type used as the response payload generic.

## Notes

- `request.authContext` is accessed as a direct property (set upstream by middleware), while the caller context is derived via the `callerContextOf` helper — the two are distinct and both passed to the service.
- The Express generic on `request` marks `orderId` as optional (`orderId?: string`); actual presence is enforced at runtime by `requireId`, so TypeScript does not guarantee its existence inside the handler.
- The early `return Promise.resolve()` after a failed `requireId` call is the pattern used to signal "response already sent, stop processing" without an explicit `throw`.
