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
import { invalidateCache, searchCache, setCache } from '@infrastructure/http/middlewares/cache';
import { routeFlag } from '@infrastructure/http/middlewares/route-flag';
import { idempotencyKey } from '@infrastructure/http/middlewares/idempotency';

/** Express router for order management (authenticated; non-admin users see only their own orders). */
export const router = Router();

// All order routes require authentication
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
    requirePermission('orders.create'),
    idempotencyKey,
    invalidateCache(['orders', 'products']),
    writeOrders
);

// PUT /orders — admin, id in body (update)
router.put('/', requirePermission('orders.update'), invalidateCache(['orders']), writeOrders);

// DELETE /orders — admin, id in body
router.delete('/', requirePermission('orders.delete'), invalidateCache(['orders']), deleteOrders);

// POST /orders/:id/cancel — the one order write a customer can make (owner or admin;
// the service's conditional write carries the caller's scope)
router.post('/:id/cancel', invalidateCache(['orders', 'products']), postCancelOrder);

// GET /orders/:id/invoice — must come before /:id
router.get(
    '/:id/invoice',
    setCache(3600, { tags: ['orders'], keyParameters: [] }),
    getOrderInvoice
);

// GET /orders/:id
router.get('/:id', setCache(3600, { tags: ['orders'], keyParameters: [] }), getOrderItem);

// PUT /orders/:id — admin only (update)
router.put('/:id', requirePermission('orders.update'), invalidateCache(['orders']), writeOrders);

// DELETE /orders/:id — admin only (soft delete unless ?hardDelete=true)
router.delete(
    '/:id',
    requirePermission('orders.delete'),
    invalidateCache(['orders']),
    deleteOrders
);

// DELETE /orders/:id/hard — the same operation, with the flag spelled in the path
router.delete(
    '/:id/hard',
    requirePermission('orders.delete'),
    invalidateCache(['orders']),
    routeFlag('hardDelete'),
    deleteOrders
);
