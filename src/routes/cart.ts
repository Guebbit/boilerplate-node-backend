import express from 'express';
import { isAuth } from "../middlewares/authorizations";
import { csrfSynchronisedProtection } from "../middlewares/csrf";

import { getCart } from "../controllers/cart/get-cart";
import { getCheckout } from "../controllers/cart/get-checkout";
import { postSetCartItem } from "../controllers/cart/post-set-cart-item";
import { postDeleteCartItem } from "../controllers/cart/post-delete-cart-item";
import { postDeleteCart } from "../controllers/cart/post-delete-cart";

const router = express.Router();

router.get('/cart', isAuth, getCart);

router.post('/cart', isAuth, csrfSynchronisedProtection, postSetCartItem);

router.post('/cart/delete', isAuth, csrfSynchronisedProtection, postDeleteCartItem);

router.post('/cart/delete-all', isAuth, csrfSynchronisedProtection, postDeleteCart);

router.get('/checkout', isAuth, getCheckout);

export default router;