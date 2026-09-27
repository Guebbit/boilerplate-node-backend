/**
 * @module
 * Express router for order management — authenticated throughout; non-admin callers see only
 * their own orders. Route order matters where a static segment (`/search`) or a longer path
 * (`/:id/hard`) would otherwise be swallowed by `/:id`.
 *
 * `GET /orders/{id}/invoice` and `/credit-note` are NOT here: `invoicing` mounts its own router at
 * this same `/orders` basePath (see `docs/theory/layers.md`'s `account`/`addresses` precedent) and
 * owns both, since it owns what they read. Router order at the app tier still matters between the
 * two — see `invoicing/module.ts`.
 */

import { Router } from 'express';
import { getAuth, isAuth, requirePermission } from '@kernel/middlewares/authorizations';
import { getOrders } from './controllers/get-orders';
import { createOrder } from './controllers/create-order';
import { replaceOrderById, updateOrderById } from './controllers/update-order';
import { deleteOrders } from './controllers/delete-orders';
import { restoreOrders } from './controllers/restore-orders';
import { getOrderItem } from './controllers/get-order-item';
import { postCancelOrder } from './controllers/post-cancel-order';
import { postOrderStatusOverride } from './controllers/post-order-status-override';
import { invalidateCache, noStore, privateNoCache } from '@infrastructure/http/middlewares/cache';
import { routeFlag } from '@infrastructure/http/middlewares/route-flag';
import { idempotencyKey } from '@infrastructure/http/middlewares/idempotency';

/** Express router for order management (authenticated; non-admin users see only their own orders). */
export const router = Router();

/*
 * All order routes require authentication — a SESSION, not an api key.
 *
 * `isAuth` rather than `isAuthOrCredential` because this router is mixed: the `orders.any.*`
 * routes are tenant-scoped and would qualify, but `/:id` and `/:id/cancel` are
 * the customer's own view and narrow their reads through `orderService.callerScope(authContext)`.
 * A credential reaching those resolves to no `authContext` and would silently widen the scope
 * from "my orders" to whatever the fallback is — exactly the bug the split guard exists to make
 * impossible. Opening this module up means splitting the router first.
 */
router.use(getAuth, isAuth);

// POST /orders/search — must come before /:id. Never Redis-cached: the answer depends on who is
// asking (non-admin sees only their own orders), so a shared cache must never hold it — RFC 9111
// §3.5. `noStore`, like every POST answer.
router.post('/search', noStore, getOrders);

// GET /orders — list (non-admin sees own orders only). `privateNoCache`: the browser may keep its
// own copy, revalidated every time.
router.get('/', privateNoCache, getOrders);

// POST /orders — admin creates order directly. idempotencyKey first: a retried creation must
// replay the SAME order rather than mint a second one. `products`, not `orders` — no route on
// this router still tags a cache entry `orders`.
router.post(
    '/',
    requirePermission('orders.any.create'),
    idempotencyKey,
    invalidateCache(['products']),
    createOrder
);

// DELETE /orders — admin, id in body
router.delete('/', requirePermission('orders.any.delete'), deleteOrders);

// POST /orders/:id/cancel — the one order write a customer can make (owner or admin;
// the service's conditional write carries the caller's scope)
router.post('/:id/cancel', invalidateCache(['products']), postCancelOrder);

// POST /orders/:id/status-override — must come before /:id
router.post(
    '/:id/status-override',
    requirePermission('orders.any.override'),
    postOrderStatusOverride
);

// GET /orders/:id — never Redis-cached, same reasoning as the search routes above: this is the
// caller's OWN order.
router.get('/:id', privateNoCache, getOrderItem);

// PUT /orders/:id — admin only (replace)
router.put('/:id', requirePermission('orders.any.update'), replaceOrderById);

// PATCH /orders/:id — admin only (merge)
router.patch('/:id', requirePermission('orders.any.update'), updateOrderById);

// DELETE /orders/:id — admin only (soft delete unless ?hardDelete=true)
router.delete('/:id', requirePermission('orders.any.delete'), deleteOrders);

// POST /orders/:id/restore — undo a soft delete; a second DELETE never does
router.post('/:id/restore', requirePermission('orders.any.delete'), restoreOrders);

// DELETE /orders/:id/hard — the same operation, with the flag spelled in the path
router.delete(
    '/:id/hard',
    requirePermission('orders.any.delete'),
    routeFlag('hardDelete'),
    deleteOrders
);
