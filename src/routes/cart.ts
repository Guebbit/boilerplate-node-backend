import express from 'express';
import { isAuth } from "../middlewares/authorizations";

import { pageCart } from "../controllers/cart/page-cart";
import { getCartSummary } from "../controllers/cart/get-cart-summary";
import { postSetCartItem } from "../controllers/cart/post-set-cart-item";
import { putCartItemById } from "../controllers/cart/put-cart-item-by-id";
import { postDeleteCartItem } from "../controllers/cart/post-delete-cart-item";
import { postDeleteCart } from "../controllers/cart/post-delete-cart";
import { postOrder } from "../controllers/orders/post-order";

const router = express.Router();

// All cart routes require authentication

// GET /cart/summary — get cart summary (must be before /:productId to avoid conflict)
router.get('/summary', isAuth, getCartSummary);

// GET /cart — get full cart with items and summary
router.get('/', isAuth, pageCart);

// POST /cart — add or set a cart item (upsert by productId)
router.post('/', isAuth, postSetCartItem);

// DELETE /cart — clear entire cart
router.delete('/', isAuth, postDeleteCart);

// PUT /cart/:productId — update a specific cart item quantity
router.put('/:productId', isAuth, putCartItemById);

// DELETE /cart/:productId — remove a specific cart item
router.delete('/:productId', isAuth, postDeleteCartItem);

// POST /cart/checkout — create order from cart
router.post('/checkout', isAuth, postOrder);

export default router;
