/**
 * @module
 * Route table for delivery. Guards are chosen per route, because the three routes have three
 * different audiences: the methods list is pre-purchase information and stays public, the
 * shipment read needs a caller to scope ownership to, and the courier tick is staff's button.
 *
 * See: docs/modules/delivery.md
 */

import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@kernel/middlewares/authorizations';
import { getShippingMethods } from './controllers/get-shipping-methods';
import { getShipmentByOrder } from './controllers/get-shipment-by-order';
import { postCourierAdvance } from './controllers/post-courier-advance';

/** Express router for delivery operations (methods, shipments, the courier tick). */
export const router = Router();

// GET /delivery/methods — public: what shipping costs is pre-purchase information
router.get('/methods', getShippingMethods);

// GET /delivery/order/:orderId — the parcel behind one of the caller's orders
router.get('/order/:orderId', getAuth, isAuth, getShipmentByOrder);

// POST /delivery/advance — the fake courier's tick; an operator is the cron
router.post('/advance', getAuth, isAuth, isAdmin, postCourierAdvance);
