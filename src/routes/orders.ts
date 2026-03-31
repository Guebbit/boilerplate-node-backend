import express from 'express';
import { isAuth } from '@middlewares/authorizations';
import { csrfSynchronisedProtection } from '@middlewares/csrf';

import { pageAllOrders } from '@controllers/orders/page-all-orders';
import { getTargetOrder } from '@controllers/orders/get-target-order';
import { getTargetInvoice } from '@controllers/orders/get-target-invoice';
import { postOrder } from '@controllers/orders/post-order';

const router = express.Router();

router.get('/', isAuth, pageAllOrders);

router.get('/details/:orderId', isAuth, getTargetOrder);

router.get('/invoice/:orderId', isAuth, getTargetInvoice);

router.post('/new', isAuth, csrfSynchronisedProtection, postOrder);

export default router;
