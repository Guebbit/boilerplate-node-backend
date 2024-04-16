import express from 'express';
import { isAuth } from "../middlewares/authorizations";

import getAllOrders from "../controllers/orders/get-all-orders";
import getTargetOrder from "../controllers/orders/get-target-order";
import postOrder from "../controllers/orders/post-order";

const router = express.Router();

router.get('/', isAuth, getAllOrders);

router.get('/details/:orderId', isAuth, getTargetOrder);

router.post('/new', isAuth, postOrder);

export default router;
