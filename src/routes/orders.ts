import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import getOrders from '@controllers/orders/get-orders';
import postOrders from '@controllers/orders/post-orders';
import putOrders from '@controllers/orders/put-orders';
import deleteOrders from '@controllers/orders/delete-orders';
import postOrdersSearch from '@controllers/orders/post-orders-search';
import getOrderById from '@controllers/orders/get-order-by-id';
import putOrderById from '@controllers/orders/put-order-by-id';
import deleteOrderById from '@controllers/orders/delete-order-by-id';
import getOrderInvoice from '@controllers/orders/get-order-invoice';

const router = Router();

// All order routes require authentication
router.use(getAuth, isAuth);

// POST /orders/search — must come before /:id
router.post('/search', postOrdersSearch);

// GET /orders — list (non-admin sees own orders only)
router.get('/', getOrders);

// POST /orders — admin creates order directly
router.post('/', isAdmin, postOrders);

// PUT /orders — admin, id in body
router.put('/', isAdmin, putOrders);

// DELETE /orders — admin, id in body
router.delete('/', isAdmin, deleteOrders);

// GET /orders/:id/invoice — must come before /:id
router.get('/:id/invoice', getOrderInvoice);

// GET /orders/:id
router.get('/:id', getOrderById);

// PUT /orders/:id — admin only
router.put('/:id', isAdmin, putOrderById);

// DELETE /orders/:id — admin only
router.delete('/:id', isAdmin, deleteOrderById);

export default router;
