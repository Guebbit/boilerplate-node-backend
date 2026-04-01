import express from 'express';
import { isAuth } from '@middlewares/authorizations';
import { csrfSynchronisedProtection } from '@middlewares/csrf';

import { pageCart } from '@controllers/cart/page-cart';
import { pageCheckout } from '@controllers/cart/page-checkout';
import { postCartItem } from '@controllers/cart/post-cart-item';
import { postDeleteCartItem } from '@controllers/cart/post-delete-cart-item';
import { postDeleteCart } from '@controllers/cart/post-delete-cart';

const router = express.Router();

router.get('/cart/', isAuth, pageCart);

router.post('/cart/', isAuth, csrfSynchronisedProtection, postCartItem);

router.post('/cart/delete', isAuth, csrfSynchronisedProtection, postDeleteCartItem);

router.post('/cart/delete-all', isAuth, csrfSynchronisedProtection, postDeleteCart);

router.get('/checkout', isAuth, pageCheckout);

export { router as cartRoutes };
