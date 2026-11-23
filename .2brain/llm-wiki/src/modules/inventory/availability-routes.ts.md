---
source: src/modules/inventory/availability-routes.ts
source_sha256: 368ee2cafd737f411c5e9358e55aefec3609dd0106798ada8858c5b6d3e3f029
context_sha256: e6f8779fa920099369473d7997f96ea937748874797aaae6638cc7ab40b1ebdb
generated_at: 2026-11-22T05:16:21.347637+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/availability-routes.ts

## Purpose
Defines the Express router for the public product-availability reads. It is mounted at `/products` (the catalogue's URL, inventory's answer, following the pattern of `src/modules/payments/order-routes.ts`) so a storefront can check stock before anyone signs in.

## Key elements
- `availabilityRouter`: Express `Router` exported for mounting.
- `availabilityRouter.use(getAuth)`: resolves the caller on every request, with no identity guard, so guests are allowed. Who is asking still matters because staff see hidden products that guests do not.
- `GET /availability` (`?id=a&id=b`): availability for many products at once, handled by `listProductAvailabilityItems`, behind `publicNoCache`.
- `GET /:id/availability`: availability for one product, handled by `getProductAvailabilityItem`, behind `publicNoCache`.

## Relationships
- `src/kernel/middlewares/authorizations.ts`: supplies `getAuth`, applied to the whole router.
- `src/infrastructure/http/middlewares/cache.ts`: supplies `publicNoCache`, applied to both routes.
- `src/modules/inventory/controllers/list-product-availability.ts`: supplies `listProductAvailabilityItems` for the bulk route.
- `src/modules/inventory/controllers/get-product-availability.ts`: supplies `getProductAvailabilityItem` for the single-product route.
- `src/modules/inventory/module.ts`: the module's own `/inventory` mount is the first mount; this router is the second, mounted at `/products`.

## Notes
- Mount order matters. The `products` module mounts `/:id`, which would read `availability` as an id and return 404. `inventory` must be listed before `products` in `src/modules.ts` so `GET /products/availability` reaches this router first.
- `tests/integration/availability-route-order.test.ts` fails if that order flips.
- Within this file, the static `/availability` route is declared before `/:id/availability`.
- The file's header comment points to the "the-availability-reads" section of the inventory module docs for further detail.
