/**
 * @module
 * Express router for order management — authenticated throughout; non-admin callers see only
 * their own orders. Route order matters where a static segment (`/search`) or a longer path
 * (`/:id/invoice`, `/:id/hard`) would otherwise be swallowed by `/:id`.
 */

import { Router } from 'express';
import { getAuth, isAuth, requirePermission } from '@kernel/middlewares/authorizations';
import { getOrders, searchOrdersKeyParameters } from './controllers/get-orders';
import { writeOrders } from './controllers/write-orders';
import { deleteOrders } from './controllers/delete-orders';
import { getOrderItem } from './controllers/get-order-item';
import { getOrderInvoice } from './controllers/get-order-invoice';
import { postCancelOrder } from './controllers/post-cancel-order';
import { postOrderStatusOverride } from './controllers/post-order-status-override';
import { invalidateCache, searchCache, setCache } from '@infrastructure/http/middlewares/cache';
import { routeFlag } from '@infrastructure/http/middlewares/route-flag';
import { idempotencyKey } from '@infrastructure/http/middlewares/idempotency';
import { invoiceLimiter } from './rate-limits';

/** Express router for order management (authenticated; non-admin users see only their own orders). */
export const router = Router();

/*
 * All order routes require authentication — a SESSION, not an api key.
 *
 * `isAuth` rather than `isAuthOrCredential` because this router is mixed: the `orders.any.*`
 * routes are tenant-scoped and would qualify, but `/:id`, `/:id/cancel` and `/:id/invoice` are
 * the customer's own view and narrow their reads through `orderService.callerScope(authContext)`.
 * A credential reaching those resolves to no `authContext` and would silently widen the scope
 * from "my orders" to whatever the fallback is — exactly the bug the split guard exists to make
 * impossible. Opening this module up means splitting the router first.
 */
router.use(getAuth, isAuth);

/** Shared cache middleware for both search entry points, keyed on the query parameters that change the answer. */
const cacheOrdersSearch = searchCache('orders', searchOrdersKeyParameters);

// POST /orders/search — must come before /:id
router.post('/search', cacheOrdersSearch, getOrders);

// GET /orders — list (non-admin sees own orders only)
router.get('/', cacheOrdersSearch, getOrders);

// POST /orders — admin creates order directly. idempotencyKey first: a retried creation must
// replay the SAME order rather than mint a second one.
router.post(
    '/',
    requirePermission('orders.any.create'),
    idempotencyKey,
    invalidateCache(['orders', 'products']),
    writeOrders
);

// PUT /orders — admin, id in body (update)
router.put('/', requirePermission('orders.any.update'), invalidateCache(['orders']), writeOrders);

// DELETE /orders — admin, id in body
router.delete(
    '/',
    requirePermission('orders.any.delete'),
    invalidateCache(['orders']),
    deleteOrders
);

// POST /orders/:id/cancel — the one order write a customer can make (owner or admin;
// the service's conditional write carries the caller's scope)
router.post('/:id/cancel', invalidateCache(['orders', 'products']), postCancelOrder);

// POST /orders/:id/status-override — must come before /:id
router.post(
    '/:id/status-override',
    requirePermission('orders.any.override'),
    invalidateCache(['orders']),
    postOrderStatusOverride
);

// GET /orders/:id/invoice — must come before /:id. Not cached: every hit renders fresh, and
// caching PDF bytes as a JSON-cache value would only ever hold the first byte range express
// actually flushed. `invoiceLimiter` guards the Chromium launch every render spawns.
router.get('/:id/invoice', invoiceLimiter, getOrderInvoice);

// GET /orders/:id
router.get('/:id', setCache(3600, { tags: ['orders'], keyParameters: [] }), getOrderItem);

// PUT /orders/:id — admin only (update)
router.put(
    '/:id',
    requirePermission('orders.any.update'),
    invalidateCache(['orders']),
    writeOrders
);

// DELETE /orders/:id — admin only (soft delete unless ?hardDelete=true)
router.delete(
    '/:id',
    requirePermission('orders.any.delete'),
    invalidateCache(['orders']),
    deleteOrders
);

// DELETE /orders/:id/hard — the same operation, with the flag spelled in the path
router.delete(
    '/:id/hard',
    requirePermission('orders.any.delete'),
    invalidateCache(['orders']),
    routeFlag('hardDelete'),
    deleteOrders
);
