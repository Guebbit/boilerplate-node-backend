import express from 'express';
import { isAuth } from "../middlewares/authorizations";

import getAllOrders from "../controllers/orders/getAllOrders";
import getTargetOrder from "../controllers/orders/getTargetOrder";
import postOrder from "../controllers/orders/postOrder";

const router = express.Router();

router.get('/', isAuth, getAllOrders);

router.get('/details/:orderId', isAuth, getTargetOrder);

router.post('/new', isAuth, postOrder);

export default router;
