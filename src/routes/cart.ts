import { Router } from 'express';
import { getAuth, isAuth } from '@middlewares/authorizations';
import getCart from '@controllers/cart/get';
import getCartSummary from '@controllers/cart/get-summary';
import upsertCartItem from '@controllers/cart/post-upsert-item';
import updateCartItemById from '@controllers/cart/put-update-item-by-id';
import clearCart from '@controllers/cart/delete';
import removeCartItem from '@controllers/cart/delete-item-by-id';
import checkout from '@controllers/cart/post-checkout';

const router = Router();

// All cart routes require authentication
router.use(getAuth, isAuth);

// Static sub-paths — must be declared before /:productId
// GET /cart/summary
router.get('/summary', getCartSummary);

// POST /cart/checkout
router.post('/checkout', checkout);

// GET /cart
router.get('/', getCart);

// POST /cart — add/set item
router.post('/', upsertCartItem);

// DELETE /cart — clear cart or remove item via body { productId }
router.delete('/', clearCart);

// PUT /cart/:productId — set quantity
router.put('/:productId', updateCartItemById);

// DELETE /cart/:productId — remove item
router.delete('/:productId', removeCartItem);

export default router;
