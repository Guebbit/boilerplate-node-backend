---
source: src/modules/delivery/controllers/get-shipping-methods.ts
source_sha256: 5a57ed6bf61227db7b1f3ff688d9221aad71856115230e24768f471f90200026
context_sha256: 6b50f48dbf63625fd14ccdb3ee7e4f312897fb57a58f7247614d90c739ee2b8c
generated_at: 2026-11-22T04:46:02.189155+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/controllers/get-shipping-methods.ts

## Purpose
Express controller for `GET /delivery/methods`. It returns the shipping methods the shop offers, including flat rates and free-above thresholds. The endpoint is public, so guests can see shipping costs before signing up.

## Key elements
- `getShippingMethods(request, response)`: the exported handler. It calls `deliveryService.listMethods()` and sends `result.data` through `successResponse<ShippingMethodsResponse>`. It never sends an error response.

## Relationships
- `src/infrastructure/http/response.ts`: provides `successResponse`, which formats the HTTP response.
- `src/modules/delivery/services/index.ts`: provides `deliveryService`. `listMethods()` supplies the data.
- `src/types/index.ts`: provides the `ShippingMethodsResponse` type, which is the response payload shape.
- `src/modules/delivery/routes.ts`: the routes file that wires this handler to `GET /delivery/methods`. This page does not show the registration itself.

## Notes
- The handler deliberately has no `?weight=` filter. The query string was client-supplied and advisory only. The real weight-fit check runs server-side in `PUT /cart/shipping-method` and `POST /cart/checkout`, against the actual basket. Clients get the full list here and let those write endpoints say which methods the basket can use.
- `listMethods` is treated as always successful, so `data` is always set. The code relies on this and does no error handling.
- The `request` parameter is unused.
