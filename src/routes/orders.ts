import express from 'express';
import { isAuth, isAdmin } from "../middlewares/authorizations";

import { pageAllOrders } from "../controllers/orders/page-all-orders";
import { getTargetOrder } from "../controllers/orders/get-target-order";
import { getTargetInvoice } from "../controllers/orders/get-target-invoice";
import { postCreateOrder, putEditOrder, putEditOrderById, deleteOrder, deleteOrderById } from "../controllers/orders/post-edit-order";
import { postSearchOrders } from "../controllers/orders/post-search-orders";

const router = express.Router();

// POST /orders/search — search orders with body filters (must be before /:id)
router.post('/search', isAuth, postSearchOrders);

// GET /orders — list orders (all for admin; own for regular users)
router.get('/', isAuth, pageAllOrders);

// POST /orders — create a new order (admin only)
router.post('/', isAuth, isAdmin, postCreateOrder);

// PUT /orders — update order with id in body (admin only)
router.put('/', isAuth, isAdmin, putEditOrder);

// DELETE /orders — delete order with id in body (admin only)
router.delete('/', isAuth, isAdmin, deleteOrder);

// GET /orders/:orderId/invoice — download order invoice PDF (must be before /:id to avoid conflict)
router.get('/:orderId/invoice', isAuth, getTargetInvoice);

// GET /orders/:orderId — get a single order
router.get('/:orderId', isAuth, getTargetOrder);

// PUT /orders/:id — update a specific order (admin only)
router.put('/:id', isAuth, isAdmin, putEditOrderById);

// DELETE /orders/:id — delete a specific order (admin only)
router.delete('/:id', isAuth, isAdmin, deleteOrderById);

export default router;
