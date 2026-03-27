import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import {
    listOrders,
    createOrder,
    updateOrder,
    deleteOrder,
    searchOrders,
    getOrderById,
    updateOrderById,
    deleteOrderById,
    getOrderInvoice,
} from '@controllers/orders';

const router = Router();

// All order routes require authentication
router.use(getAuth, isAuth);

// POST /orders/search — must come before /:id
router.post('/search', searchOrders);

// GET /orders — list (non-admin sees own orders only)
router.get('/', listOrders);

// POST /orders — admin creates order directly
router.post('/', isAdmin, createOrder);

// PUT /orders — admin, id in body
router.put('/', isAdmin, updateOrder);

// DELETE /orders — admin, id in body
router.delete('/', isAdmin, deleteOrder);

// GET /orders/:id/invoice — must come before /:id
router.get('/:id/invoice', getOrderInvoice);

// GET /orders/:id
router.get('/:id', getOrderById);

// PUT /orders/:id — admin only
router.put('/:id', isAdmin, updateOrderById);

// DELETE /orders/:id — admin only
router.delete('/:id', isAdmin, deleteOrderById);

export default router;
