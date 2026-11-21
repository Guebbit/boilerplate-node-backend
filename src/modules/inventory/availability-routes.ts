/**
 * @module
 * The availability reads, mounted at `/products` — the catalogue's URL, inventory's answer (the
 * pattern of `payments/order-routes.ts`). Public: a storefront asks it before anyone signs in.
 * Mounted AFTER `/inventory` (the first mount is the module's own, see `./module.ts`).
 *
 * Mount order matters here and nowhere else: `products` mounts `/:id`, which would read the word
 * `availability` as an id and answer 404. `inventory` is listed before `products` in
 * `src/modules.ts`, so this router sees `GET /products/availability` first;
 * `tests/integration/availability-route-order.test.ts` fails if that ever flips.
 *
 * @see docs/modules/inventory.md#the-availability-reads
 */

import { Router } from 'express';
import { getAuth } from '@kernel/middlewares/authorizations';
import { publicNoCache } from '@infrastructure/http/middlewares/cache';
import { getProductAvailabilityItem } from './controllers/get-product-availability';
import { listProductAvailabilityItems } from './controllers/list-product-availability';

/** Express router for the availability reads. */
export const availabilityRouter = Router();

/**
 * `getAuth` and no identity guard: a guest reads it. Who is asking still matters, because staff
 * see hidden products a guest does not, so the caller is resolved on every request.
 */
availabilityRouter.use(getAuth);

// GET /products/availability?id=a&id=b — many at once; a static segment, so before `/:id/…`.
availabilityRouter.get('/availability', publicNoCache, listProductAvailabilityItems);

// GET /products/:id/availability — one product.
availabilityRouter.get('/:id/availability', publicNoCache, getProductAvailabilityItem);
