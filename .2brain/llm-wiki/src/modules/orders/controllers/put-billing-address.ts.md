---
source: src/modules/orders/controllers/put-billing-address.ts
source_sha256: e30b7391cc05e99a1e33454e039a81ae8b433fb9007235e9694434b5e1569c65
context_sha256: 13cd80f2a5bda5d3e372e9d8cf9a97579755f6bc5406bc238b85ff37adefd616
generated_at: 2026-11-22T06:10:03.505709+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/controllers/put-billing-address.ts

## Purpose
Express controller for `PUT /orders/:id/billing-address`, used by staff to correct who an order is invoiced to. It is thin wiring onto `orderService.correctBillingAddress`. The route's `requirePermission('update', 'Order')` has already confirmed the caller may edit orders.

## Key elements
- `putBillingAddress(request, response): Promise<void>` is the only export. It runs these steps in order:
  1. Validates the `:id` param with `requireId`. A missing or invalid id yields the `orders.not-found` error, and the handler resolves early.
  2. Validates the body against `CorrectOrderBillingAddressBody` (from `@api/schemas.zod`) with `parseBody`. An invalid body resolves early.
  3. Calls `orderService.correctBillingAddress(id, body, callerContextOf(request))`.
  4. If `refused(response, result)` is true, it returns without further output. Otherwise it responds with `respondWithOrder(response, result.data, request.authContext, 'putBillingAddress')`.
  5. Any rejection is handled by `catchAs(response, 'putBillingAddress')`.

## Relationships
- `src/infrastructure/http/controller.ts` supplies `parseBody`, `refused` and `catchAs`, which handle body validation, service refusals and error mapping.
- `src/infrastructure/http/ids.ts` supplies `requireId`, which validates the route id.
- `src/infrastructure/http/request.ts` supplies `callerContextOf`, which builds the caller context passed to the service.
- `src/modules/orders/controllers/respond.ts` supplies `respondWithOrder`, which serializes the updated order into the response.
- `src/modules/orders/services/index.ts` exports `orderService`, which performs the correction.
- `src/modules/orders/routes.ts` is the neighbor that mounts this handler. It applies the permission check mentioned in the module doc.

## Notes
- The endpoint replaces the address only and changes nothing else on the order.
- There is no `If-Match` precondition. The source comment gives the reason: there is no GET on this URL, and this is a staff fix-up of a single field.
- The handler returns `Promise.resolve()` on early validation failures, so it always returns a Promise.
- The string `'putBillingAddress'` is passed to both `respondWithOrder` and `catchAs`. It appears to be an operation label for those helpers.
