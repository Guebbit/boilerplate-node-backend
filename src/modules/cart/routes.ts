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
 * `/all` is mounted ABOVE `/:productId`: Express matches in mount order, so a
 * `/:productId`-shaped route registered first would match the literal string `all` as a product
 * id. The same rule that mounts `/search` before `/:id` elsewhere, a different static segment.
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
import { postCart } from './controllers/post-cart';
import { putCartItem } from './controllers/put-cart-item';
import { clearCart } from './controllers/delete-cart-all';
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

// POST /cart/reorder/:orderId — copy one of the caller's own orders back into the cart
router.post('/reorder/:orderId', postReorder);

// GET /cart
router.get('/', getCart);

// POST /cart — add/set item
router.post('/', postCart);

// DELETE /cart/all — clear entire cart. Mounted before /:productId — see the module comment.
router.delete('/all', clearCart);

// DELETE /cart — remove single item, productId in the body. x-alias-of removeCartItem.
router.delete('/', deleteCartItem);

// PUT /cart/shipping-method — mounted ABOVE /:productId, same reasoning as /all: a /:productId
// route registered first would swallow the literal string "shipping-method" as a product id.
router.put('/shipping-method', putCartShippingMethod);

// PUT /cart/:productId — set quantity
router.put('/:productId', putCartItem);

// DELETE /cart/:productId — remove single item, canonical spelling
router.delete('/:productId', deleteCartItem);
