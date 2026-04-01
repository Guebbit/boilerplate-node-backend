import express from 'express';
import { isAuth } from '@middlewares/authorizations';
import { csrfSynchronisedProtection } from '@middlewares/csrf';

import { pageAllOrders } from '@controllers/orders/page-all-orders';
import { getOrderItem } from '@controllers/orders/get-order-item';
import { getOrderInvoice } from '@controllers/orders/get-order-invoice';
import { postOrder } from '@controllers/orders/post-order';

const router = express.Router();

router.get('/', isAuth, pageAllOrders);

router.get('/details/:orderId', isAuth, getOrderItem);

router.get('/invoice/:orderId', isAuth, getOrderInvoice);

router.post('/new', isAuth, csrfSynchronisedProtection, postOrder);

export { router as orderRoutes };
