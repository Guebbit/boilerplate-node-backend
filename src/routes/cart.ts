import express from 'express';
import { isAuth } from "../middlewares/authorizations";

import getCart from "../controllers/cart/get-cart";
import getCheckout from "../controllers/cart/get-checkout";
import postAddCartItem from "../controllers/cart/post-add-cart-item";
import postDeleteCartItem from "../controllers/cart/post-delete-cart-item";
import postDeleteCart from "../controllers/cart/post-delete-cart";

const router = express.Router();

router.get('/cart', isAuth, getCart);

router.post('/cart', isAuth, postAddCartItem);

router.post('/cart/delete', isAuth, postDeleteCartItem);

router.post('/cart/delete-all', isAuth, postDeleteCart);

router.get('/checkout', isAuth, getCheckout);

export default router;