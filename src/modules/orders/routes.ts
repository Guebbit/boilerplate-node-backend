/**
 * @module
 * Express router for order management — authenticated throughout; a caller holding only
 * `read:Order` sees their own orders. Route order matters where a static segment (`/search`) or a longer path
 * (`/:id/hard`) would otherwise be swallowed by `/:id`.
 *
 * `GET /orders/{id}/invoice` and `/credit-note` are NOT here: `invoicing` mounts its own router at
 * this same `/orders` basePath (see `docs/theory/layers.md`'s `account`/`addresses` precedent) and
 * owns both, since it owns what they read. Router order at the app tier still matters between the
 * two — see `invoicing/module.ts`.
 */

import { Router, type Request } from 'express';
import {
    getAuth,
    isAuth,
    requireFreshAuthWhen,
    requirePermission
} from '@kernel/middlewares/authorizations';
import { holds } from '@kernel/ability';
import { callerForSubject } from '@kernel/permissions';
import { getOrders } from './controllers/get-orders';
import { createOrder } from './controllers/create-order';
import { replaceOrderById, updateOrderById } from './controllers/update-order';
import { deleteOrders } from './controllers/delete-orders';
import { restoreOrders } from './controllers/restore-orders';
import { getOrderItem } from './controllers/get-order-item';
import { getOrdersExport } from './controllers/get-orders-export';
import { ordersExportLimiter } from './rate-limits';
import { getOrderTimeline } from './controllers/get-order-timeline';
import { postCancelOrder } from './controllers/post-cancel-order';
import { postOrderStatusOverride } from './controllers/post-order-status-override';
import { invalidateCache, noStore, privateNoCache } from '@infrastructure/http/middlewares/cache';
import { routeFlag } from '@infrastructure/http/middlewares/route-flag';
import { idempotencyKey } from '@infrastructure/http/middlewares/idempotency';

/**
 * Whether this cancel comes from someone who holds `update:Order`: an operator's cancel can
 * keep a paid order's money, or refund it, so it needs a fresh session. A customer's own cancel is
 * never prompted — the guard asks the key, and a buyer without it passes through.
 */
const isOperatorCancel = (request: Request): boolean =>
    request.authContext !== undefined &&
    holds(callerForSubject(request.authContext, 'Order'), 'update', 'Order');

/** Express router for order management (authenticated; `read:Order` alone sees only the caller's own orders). */
export const router = Router();

/*
 * All order routes require authentication — a SESSION, not an api key.
 *
 * `isAuth` rather than `isAuthOrCredential` because this router is mixed: the staff `Order`
 * routes are tenant-scoped and would qualify, but `/:id` and `/:id/cancel` are
 * the customer's own view and narrow their reads through `orderService.callerScope(authContext)`.
 * A credential reaching those resolves to no `authContext` and would silently widen the scope
 * from "my orders" to whatever the fallback is — exactly the bug the split guard exists to make
 * impossible. Opening this module up means splitting the router first.
 */
router.use(getAuth, isAuth);

// POST /orders/search — must come before /:id. Never Redis-cached: the answer depends on who is
// asking (`read:Order` alone sees only their own orders), so a shared cache must never hold it — RFC 9111
// §3.5. `noStore`, like every POST answer.
router.post('/search', noStore, getOrders);

// GET /orders — list (`read:Order` alone sees own orders only). `privateNoCache`: the browser may keep its
// own copy, revalidated every time.
router.get('/', privateNoCache, getOrders);

// GET /orders/export — every order the filters match, as CSV. Mounted before `/:id`, or `requireId`
// answers 404 for the word `export`. `export:Order` carries its own step-up, so the guard
// asks for a fresh session before the budget or the controller run; the budget is per account
// (`rate-limits.ts`). No cache header here: the controller sets `private, no-store` on the file.
router.get('/export', requirePermission('export', 'Order'), ordersExportLimiter, getOrdersExport);

// POST /orders — admin creates order directly. idempotencyKey first: a retried creation must
// replay the SAME order rather than mint a second one. `products`, not `orders` — no route on
// this router still tags a cache entry `orders`.
router.post(
    '/',
    requirePermission('create', 'Order'),
    idempotencyKey,
    invalidateCache(['products']),
    createOrder
);

// DELETE /orders — admin, id in body
router.delete('/', requirePermission('delete', 'Order'), deleteOrders);

// POST /orders/:id/cancel — the one order write a customer can make (owner or admin;
// the service's conditional write carries the caller's scope). An operator's cancel asks a fresh
// session first, before the cache is touched: it is the door that can refund, or keep, the money.
router.post(
    '/:id/cancel',
    requireFreshAuthWhen(isOperatorCancel, 'critical'),
    invalidateCache(['products']),
    postCancelOrder
);

// POST /orders/:id/status-override — must come before /:id
router.post(
    '/:id/status-override',
    requirePermission('override', 'Order'),
    postOrderStatusOverride
);

// GET /orders/:id/timeline — the order's history; scoped like the order itself, and what each
// caller sees of it is decided per row (the audience table in the domain layer). Never Redis-cached.
router.get('/:id/timeline', privateNoCache, getOrderTimeline);

// GET /orders/:id — never Redis-cached, same reasoning as the search routes above: this is the
// caller's OWN order.
router.get('/:id', privateNoCache, getOrderItem);

// PUT /orders/:id — admin only (replace)
router.put('/:id', requirePermission('update', 'Order'), replaceOrderById);

// PATCH /orders/:id — admin only (merge)
router.patch('/:id', requirePermission('update', 'Order'), updateOrderById);

// DELETE /orders/:id — admin only (soft delete unless ?hardDelete=true)
router.delete('/:id', requirePermission('delete', 'Order'), deleteOrders);

// POST /orders/:id/restore — undo a soft delete; a second DELETE never does
router.post('/:id/restore', requirePermission('delete', 'Order'), restoreOrders);

// DELETE /orders/:id/hard — the same operation, with the flag spelled in the path
router.delete(
    '/:id/hard',
    requirePermission('delete', 'Order'),
    routeFlag('hardDelete'),
    deleteOrders
);
