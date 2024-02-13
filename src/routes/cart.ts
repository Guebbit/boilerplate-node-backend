import express from 'express';
import { isAuth } from "../middlewares/authorizations";

import getCart from "../controllers/cart/getCart";
import postAddCartItem from "../controllers/cart/postAddCartItem";
import postDeleteCartItem from "../controllers/cart/postDeleteCartItem";

const router = express.Router();

router.get('/', isAuth, getCart);

router.post('/', isAuth, postAddCartItem);

router.post('/delete', isAuth, postDeleteCartItem);

export default router;