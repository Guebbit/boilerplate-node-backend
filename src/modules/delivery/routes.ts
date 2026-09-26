/**
 * @module
 * Route table for delivery. Guards are chosen per route: the methods list is pre-purchase
 * information and stays public, the shipment read needs a caller to scope ownership to, and the
 * two write doors are staff's — the same key that reads a shipment, for the write. See:
 * docs/modules/delivery.md
 */

import type { Request } from 'express';
import { Router } from 'express';
import {
    getAuth,
    isAuth,
    requirePermission,
    requireFreshAuthWhen,
    REAUTH_TIME_CRITICAL
} from '@kernel/middlewares/authorizations';
import { getShippingMethods } from './controllers/get-shipping-methods';
import { getShipmentByOrder } from './controllers/get-shipment-by-order';
import { postStartOrder } from './controllers/post-start-order';
import { postShipOrder } from './controllers/post-ship-order';
import { postDeliverOrder } from './controllers/post-deliver-order';

/**
 * Whether this request is asking to skip the normal gate — the same flag `service.ts`'s
 * `refuseUnearnedForce` reads for its own `orders.any.override` permission check, so a caller who
 * reaches this far without `forced: true` never pays for a step-up prompt a plain ship/deliver
 * never needed.
 */
const isForcedRequest = (request: Request): boolean =>
    (request.body as { forced?: boolean } | undefined)?.forced === true;

/** Express router for delivery operations (methods, shipments, recording a parcel's progress). */
export const router = Router();

// GET /delivery/methods — public: what shipping costs is pre-purchase information
router.get('/methods', getShippingMethods);

// GET /delivery/order/:orderId — the parcel behind one of the caller's orders
router.get('/order/:orderId', getAuth, isAuth, getShipmentByOrder);

// POST /delivery/order/:orderId/start — begins fulfilment; moves the order paid -> processing.
// No `forced` variant, so no step-up guard: the admin override is the other reachable path here.
router.post(
    '/order/:orderId/start',
    getAuth,
    isAuth,
    requirePermission('delivery.any.start'),
    postStartOrder
);

// POST /delivery/order/:orderId/ship — records a handover; moves the order processing -> shipped.
// `requireFreshAuthWhen` at `orders.any.override`'s own declared tier: a `forced` write reaches
// past the ordinary `processing`-only gate, and `service.ts`'s own permission check has no way to
// demand a step-up on its own — only a route-mounted guard can challenge before the controller runs.
router.post(
    '/order/:orderId/ship',
    getAuth,
    isAuth,
    requirePermission('delivery.any.update'),
    requireFreshAuthWhen(isForcedRequest, REAUTH_TIME_CRITICAL),
    postShipOrder
);

// POST /delivery/order/:orderId/deliver — records an arrival; moves the order shipped -> delivered.
// Same `forced` step-up as the ship door above.
router.post(
    '/order/:orderId/deliver',
    getAuth,
    isAuth,
    requirePermission('delivery.any.update'),
    requireFreshAuthWhen(isForcedRequest, REAUTH_TIME_CRITICAL),
    postDeliverOrder
);
