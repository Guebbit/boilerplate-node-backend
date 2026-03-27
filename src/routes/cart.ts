import express from 'express';
import { isAuth } from "@middlewares/authorizations";

import { pageCart } from "@controllers/cart/page-cart";
import { pageCheckout } from "@controllers/cart/page-checkout";
import { postSetCartItem } from "@controllers/cart/post-set-cart-item";
import { postDeleteCartItem } from "@controllers/cart/post-delete-cart-item";
import { postDeleteCart } from "@controllers/cart/post-delete-cart";

const router = express.Router();

router.get('/cart/', isAuth, pageCart);

router.post('/cart/', isAuth, postSetCartItem);

router.post('/cart/delete', isAuth, postDeleteCartItem);

router.post('/cart/delete-all', isAuth, postDeleteCart);

router.get('/checkout', isAuth, pageCheckout);

export default router;