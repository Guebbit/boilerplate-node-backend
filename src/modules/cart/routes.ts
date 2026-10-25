/**
 * @module
 * The cart route table.
 *
 * A cart is somebody's, so the whole router is authenticated and needs `update:Cart`, which
 * every signed-in account holds. `POST /checkout` is the one route that also invalidates the
 * `products` response cache — the endpoints it serves read differently once a checkout has
 * spent stock — and requires a FRESH session holding
 * `checkout:Cart` on top of `isAuth` (`requireFreshAuth`,
 * `requirePermission('checkout', 'Cart')`): it is where this app's money actually moves. The
 * two keys are the only ones this module declares — see `shared/authorization-keys.yaml`.
 * A line is written through the parent's `/items` collection (docs/api/write-methods.md#a-line-is-written-through-its-parent):
 * 200 + the whole cart, no `Location`, no read of a line.
 */

import { Router } from 'express';
import {
    getAuth,
    isAuth,
    requireFreshAuth,
    requirePermission
} from '@kernel/middlewares/authorizations';
import { getCart } from './controllers/get-cart';
import { getCartSummary } from './controllers/get-cart-summary';
import { postCartItems } from './controllers/post-cart-items';
import { patchCartItem } from './controllers/patch-cart-item';
import { clearCart } from './controllers/delete-cart-items';
import { deleteCartItem } from './controllers/delete-cart-item';
import { postCheckout } from './controllers/post-checkout';
import { postReorder } from './controllers/post-reorder';
import { postCartMerge } from './controllers/post-cart-merge';
import { putCartShippingMethod } from './controllers/put-cart-shipping-method';
import { invalidateCache } from '@infrastructure/http/middlewares/cache';
import { idempotencyKey } from '@infrastructure/http/middlewares/idempotency';
import { checkoutLimiter, mergeLimiter } from './rate-limits';

/** Express router for cart operations (add, update, remove items; checkout). */
export const router = Router();

// All cart routes require authentication. `update:Cart` comes with every signed-in account,
// staff included, so a basket is always the caller's own.
router.use(getAuth, isAuth, requirePermission('update', 'Cart'));

// GET /cart/summary
router.get('/summary', getCartSummary);

// POST /cart/checkout — money out. `checkout:Cart`: an unproven address must not be able to
// place an order and start receiving order mail at an inbox nobody has confirmed it owns.
// `idempotencyKey` in the same position as `POST /orders`' own (`orders/routes.ts`): a retried
// checkout after a lost response must replay the order it already placed, never mint a second one.
// The key is asked before the fresh session: a caller who can never pass is refused, not challenged.
router.post(
    '/checkout',
    requirePermission('checkout', 'Cart'),
    requireFreshAuth('critical'),
    // After the permission, so a refused caller never spends it; before the idempotency ledger, so
    // a replayed request still counts (a loop of retries is the thing being bounded).
    checkoutLimiter,
    idempotencyKey,
    invalidateCache(['products']),
    postCheckout
);

// POST /cart/merge — fold a guest cart in; one result per line comes back, and a line that could
// not be added at all becomes a notification. `idempotencyKey` for the same reason as checkout's:
// a retry after a lost response must replay the answer, never add the guest's quantities twice.
// `mergeLimiter` first: a hundred lines per call is a hundredfold of what the global brake counts.
router.post('/merge', mergeLimiter, idempotencyKey, postCartMerge);

// POST /cart/reorder {orderId} — copy one of the caller's own orders back into the cart
router.post('/reorder', postReorder);

// GET /cart
router.get('/', getCart);

// POST /cart/items — add a line, or grow the one already there
router.post('/items', postCartItems);

// DELETE /cart/items — clear every line
router.delete('/items', clearCart);

// PUT /cart/shipping-method — choose or clear the shipping method
router.put('/shipping-method', putCartShippingMethod);

// PATCH /cart/items/:productId — set the quantity of a line the cart holds (never creates one)
router.patch('/items/:productId', patchCartItem);

// DELETE /cart/items/:productId — remove one line
router.delete('/items/:productId', deleteCartItem);
