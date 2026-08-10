import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import { getOrders, searchOrdersKeyParameters } from '@controllers/orders/get-orders';
import { writeOrders } from '@controllers/orders/write-orders';
import { deleteOrders } from '@controllers/orders/delete-orders';
import { getOrderItem } from '@controllers/orders/get-order-item';
import { getOrderInvoice } from '@controllers/orders/get-order-invoice';
import { invalidateCache, setCache } from '@middlewares/cache';
import { routeFlag } from '@middlewares/route-flag';

/** Express router for order management (authenticated; non-admin users see only their own orders). */
export const router = Router();

// All order routes require authentication
router.use(getAuth, isAuth);

// POST /orders/search — must come before /:id
router.post('/search', getOrders);

// GET /orders — list (non-admin sees own orders only)
router.get(
    '/',
    setCache(3600, { tags: ['orders'], keyParameters: searchOrdersKeyParameters }),
    getOrders
);

// POST /orders — admin creates order directly
router.post('/', isAdmin, invalidateCache(['orders']), writeOrders);

// PUT /orders — admin, id in body (update)
router.put('/', isAdmin, invalidateCache(['orders']), writeOrders);

// DELETE /orders — admin, id in body
router.delete('/', isAdmin, invalidateCache(['orders']), deleteOrders);

// GET /orders/:id/invoice — must come before /:id
router.get(
    '/:id/invoice',
    setCache(3600, { tags: ['orders'], keyParameters: [] }),
    getOrderInvoice
);

// GET /orders/:id
router.get('/:id', setCache(3600, { tags: ['orders'], keyParameters: [] }), getOrderItem);

// PUT /orders/:id — admin only (update)
router.put('/:id', isAdmin, invalidateCache(['orders']), writeOrders);

// DELETE /orders/:id — admin only (soft delete unless ?hardDelete=true)
router.delete('/:id', isAdmin, invalidateCache(['orders']), deleteOrders);

// DELETE /orders/:id/hard — the same operation, with the flag spelled in the path
router.delete(
    '/:id/hard',
    isAdmin,
    invalidateCache(['orders']),
    routeFlag('hardDelete'),
    deleteOrders
);
