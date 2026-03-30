import { Router } from 'express';
import { getAuth, isAuth } from '@middlewares/authorizations';
import getCart from '@controllers/cart/get-cart';
import getCartSummary from '@controllers/cart/get-cart-summary';
import postCart from '@controllers/cart/post-cart';
import putCartById from '@controllers/cart/put-cart-by-id';
import deleteCart from '@controllers/cart/delete-cart';
import deleteCartById from '@controllers/cart/delete-cart-by-id';
import postCheckout from '@controllers/cart/post-checkout';

const router = Router();

// All cart routes require authentication
router.use(getAuth, isAuth);

// Static sub-paths — must be declared before /:productId
// GET /cart/summary
router.get('/summary', getCartSummary);

// POST /cart/checkout
router.post('/checkout', postCheckout);

// GET /cart
router.get('/', getCart);

// POST /cart — add/set item
router.post('/', postCart);

// DELETE /cart — clear cart or remove item via body { productId }
router.delete('/', deleteCart);

// PUT /cart/:productId — set quantity
router.put('/:productId', putCartById);

// DELETE /cart/:productId — remove item
router.delete('/:productId', deleteCartById);

export default router;
