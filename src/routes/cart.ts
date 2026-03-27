import { Router } from 'express';
import { getAuth, isAuth } from '@middlewares/authorizations';
import {
    getCart,
    getCartSummary,
    upsertCartItem,
    updateCartItemById,
    clearCart,
    removeCartItem,
    checkout,
} from '@controllers/cart';

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
