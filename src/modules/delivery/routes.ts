/**
 * @module
 * Route table for delivery. Guards are chosen per route: the methods list is pre-purchase
 * information and stays public, the shipment read needs a caller to scope ownership to, and the
 * two write doors are staff's — the same key that reads a shipment, for the write. See:
 * docs/modules/delivery.md
 */

import { Router } from 'express';
import { getAuth, isAuth, requirePermission } from '@kernel/middlewares/authorizations';
import { getShippingMethods } from './controllers/get-shipping-methods';
import { getShipmentByOrder } from './controllers/get-shipment-by-order';
import { postShipOrder } from './controllers/post-ship-order';
import { postDeliverOrder } from './controllers/post-deliver-order';

/** Express router for delivery operations (methods, shipments, recording a parcel's progress). */
export const router = Router();

// GET /delivery/methods — public: what shipping costs is pre-purchase information
router.get('/methods', getShippingMethods);

// GET /delivery/order/:orderId — the parcel behind one of the caller's orders
router.get('/order/:orderId', getAuth, isAuth, getShipmentByOrder);

// POST /delivery/order/:orderId/ship — records a handover; moves the order processing -> shipped
router.post(
    '/order/:orderId/ship',
    getAuth,
    isAuth,
    requirePermission('delivery.any.update'),
    postShipOrder
);

// POST /delivery/order/:orderId/deliver — records an arrival; moves the order shipped -> delivered
router.post(
    '/order/:orderId/deliver',
    getAuth,
    isAuth,
    requirePermission('delivery.any.update'),
    postDeliverOrder
);
