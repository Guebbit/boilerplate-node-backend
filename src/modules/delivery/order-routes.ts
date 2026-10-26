/**
 * @module
 * The delivery doors that sit under `/orders`: `POST /orders/{id}/process` and the order's two
 * fulfilment lists. The verb names the
 * status it reaches (`cancel` → `cancelled`, `process` → `processing`), so the URL belongs to the
 * order; the module and its narrow `start:Shipment` key stay delivery's. Mounted at `/orders` by
 * `./module.ts`.
 */

import { Router } from 'express';
import { getAuth, isAuth, requirePermission } from '@kernel/middlewares/authorizations';
import {
    getOrderFulfillmentOrders,
    getOrderShipments
} from './controllers/get-order-fulfillment-lists';
import { postProcessOrder } from './controllers/post-process-order';

/** Express router for the delivery operations that live under an order. */
export const orderRouter = Router();

// POST /orders/:id/process — begins fulfilment; moves the order paid -> processing.
// No `forced` variant, so no step-up guard: the admin override is the other reachable path here.
orderRouter.post(
    '/:id/process',
    getAuth,
    isAuth,
    requirePermission('start', 'Shipment'),
    postProcessOrder
);

// GET /orders/:id/fulfillment-orders and /shipments — the lists behind one of the caller's orders.
// `read:Order`, the key of the order they are about; the service scopes to the caller's own.
orderRouter.get(
    '/:id/fulfillment-orders',
    getAuth,
    isAuth,
    requirePermission('read', 'Order'),
    getOrderFulfillmentOrders
);
orderRouter.get(
    '/:id/shipments',
    getAuth,
    isAuth,
    requirePermission('read', 'Order'),
    getOrderShipments
);
