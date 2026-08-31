/**
 * @module
 * The cart route table.
 *
 * A cart is somebody's, so the whole router is authenticated. `POST /checkout` is the one route
 * that also invalidates the `orders` and `products` response caches — the endpoints those caches
 * serve read differently once a checkout has spent stock and created an order. `/all` is mounted
 * ABOVE `/:productId`: Express matches in mount order, so a `/:productId`-shaped route registered
 * first would match the literal string `all` as a product id (see CONTRACT_PLAN_POLYMORPHISM.md,
 * "Mount `/search` before `/:id`" — the same rule, a different static segment).
 */

import { Router } from 'express';
import { getAuth, isAuth } from '@kernel/middlewares/authorizations';
import { getCart } from './controllers/get-cart';
import { getCartSummary } from './controllers/get-cart-summary';
import { postCart } from './controllers/post-cart';
import { putCartItem } from './controllers/put-cart-item';
import { clearCart } from './controllers/delete-cart-all';
import { deleteCartItem } from './controllers/delete-cart-item';
import { postCheckout } from './controllers/post-checkout';
import { postReorder } from './controllers/post-reorder';
import { invalidateCache } from '@infrastructure/http/middlewares/cache';

/** Express router for cart operations (add, update, remove items; checkout). */
export const router = Router();

// All cart routes require authentication
router.use(getAuth, isAuth);

// GET /cart/summary
router.get('/summary', getCartSummary);

// POST /cart/checkout
router.post('/checkout', invalidateCache(['orders', 'products']), postCheckout);

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

// PUT /cart/:productId — set quantity
router.put('/:productId', putCartItem);

// DELETE /cart/:productId — remove single item, canonical spelling
router.delete('/:productId', deleteCartItem);
