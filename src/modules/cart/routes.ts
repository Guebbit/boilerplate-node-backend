import { Router } from 'express';
import { getAuth, isAuth } from '@kernel/middlewares/authorizations';
import { getCart } from './controllers/get-cart';
import { getCartSummary } from './controllers/get-cart-summary';
import { postCart } from './controllers/post-cart';
import { putCartItem } from './controllers/put-cart-item';
import { deleteCart } from './controllers/delete-cart';
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

// DELETE /cart — clear entire cart
router.delete('/', deleteCart);

// PUT /cart/:productId — set quantity
router.put('/:productId', putCartItem);

// DELETE /cart/:productId — remove single item
router.delete('/:productId', deleteCartItem);
