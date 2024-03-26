import express from 'express';
import { isAuth } from "../middlewares/authorizations";

import getCart from "../controllers/cart/getCart";
import getCheckout from "../controllers/cart/getCheckout";
import postAddCartItem from "../controllers/cart/postAddCartItem";
import postDeleteCartItem from "../controllers/cart/postDeleteCartItem";
import postDeleteCart from "../controllers/cart/postDeleteCart";

const router = express.Router();

router.get('/cart/', isAuth, getCart);

router.post('/cart/', isAuth, postAddCartItem);

router.post('/cart/delete', isAuth, postDeleteCartItem);

router.post('/cart/delete-all', isAuth, postDeleteCart);

router.get('/checkout', isAuth, getCheckout);

export default router;