import express from 'express';
import { getAuth, isAuth } from '@middlewares/authorizations';

import { getCart, setCartItem, removeCartItem, clearCart } from '@controllers/api/cart';

const router = express.Router();

// Populate req.user from JWT token
router.use(getAuth);

// GET /cart — get the current user's cart
router.get('/', isAuth, getCart);

// POST /cart — set a product quantity in the cart
router.post('/', isAuth, setCartItem);

// DELETE /cart/:productId — remove a specific product from the cart
router.delete('/:productId', isAuth, removeCartItem);

// DELETE /cart — clear all items from the cart
router.delete('/', isAuth, clearCart);

export default router;
