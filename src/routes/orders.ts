import express from 'express';
import { getAuth, isAuth } from '@middlewares/authorizations';

import { listOrders, getOrder, createOrder } from '@controllers/api/orders';

const router = express.Router();

// Populate req.user from JWT token
router.use(getAuth);

// GET /orders — list orders (own orders; admin sees all)
router.get('/', isAuth, listOrders);

// GET /orders/:id — get a specific order
router.get('/:id', isAuth, getOrder);

// POST /orders — create an order from current cart
router.post('/', isAuth, createOrder);

export default router;

