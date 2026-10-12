/**
 * @module
 * Route table for delivery. Guards are chosen per route: the methods list is pre-purchase
 * information and stays public, the fulfilment read needs a caller to scope ownership to, and every
 * write door is staff's — the same key that updates a shipment, for the write. See:
 * docs/modules/delivery.md
 */

import type { Request } from 'express';
import { Router } from 'express';
import {
    getAuth,
    isAuth,
    requirePermission,
    requireFreshAuthWhen
} from '@kernel/middlewares/authorizations';
import { getShippingMethods } from './controllers/get-shipping-methods';
import { getOrderFulfillment } from './controllers/get-order-fulfillment';
import { postStartOrder } from './controllers/post-start-order';
import { postShipFulfillmentOrder } from './controllers/post-ship-fulfillment-order';
import { postDeliverShipment } from './controllers/post-deliver-shipment';
import { postFulfillFulfillmentOrder } from './controllers/post-fulfill-fulfillment-order';
import {
    postHoldFulfillmentOrder,
    postReleaseFulfillmentOrder
} from './controllers/post-hold-fulfillment-order';
import { patchShipment } from './controllers/patch-shipment';

/**
 * Whether this request is asking to skip the normal gate — the same flag `service.ts`'s
 * `refuseUnearnedForce` reads for its own `orders.any.override` permission check, so a caller who
 * reaches this far without `forced: true` never pays for a step-up prompt a plain ship/deliver
 * never needed.
 */
const isForcedRequest = (request: Request): boolean =>
    (request.body as { forced?: boolean } | undefined)?.forced === true;

/** Express router for delivery operations (methods, fulfilment reads, cutting and delivering shipments, holds). */
export const router = Router();

// GET /delivery/methods — public: what shipping costs is pre-purchase information
router.get('/methods', getShippingMethods);

// GET /delivery/order/:orderId — the fulfillment orders and shipments behind one of the caller's orders
router.get('/order/:orderId', getAuth, isAuth, getOrderFulfillment);

// POST /delivery/order/:orderId/start — begins fulfilment; moves the order paid -> processing.
// No `forced` variant, so no step-up guard: the admin override is the other reachable path here.
router.post(
    '/order/:orderId/start',
    getAuth,
    isAuth,
    requirePermission('delivery.any.start'),
    postStartOrder
);

// POST /delivery/fulfillment-orders/:id/shipments — cuts a shipment; the order moves processing ->
// shipped only when nothing remains anywhere. `requireFreshAuthWhen` at `orders.any.override`'s own
// declared tier: a `forced` write reaches past the ordinary `processing`-only gate, and the
// service's own permission check has no way to demand a step-up on its own — only a route-mounted
// guard can challenge before the controller runs.
router.post(
    '/fulfillment-orders/:id/shipments',
    getAuth,
    isAuth,
    requirePermission('delivery.any.update'),
    requireFreshAuthWhen(isForcedRequest, 'critical'),
    postShipFulfillmentOrder
);

// POST /delivery/fulfillment-orders/:id/fulfill — the digital door: a shipment with no parcel,
// born delivered. No `forced` variant: there is no gate here for an override to skip past — a
// physical fulfillment order simply cannot use this door at all.
router.post(
    '/fulfillment-orders/:id/fulfill',
    getAuth,
    isAuth,
    requirePermission('delivery.any.update'),
    postFulfillFulfillmentOrder
);

// POST /delivery/fulfillment-orders/:id/hold and /release — staff holding a fulfillment order back.
router.post(
    '/fulfillment-orders/:id/hold',
    getAuth,
    isAuth,
    requirePermission('delivery.any.update'),
    postHoldFulfillmentOrder
);
router.post(
    '/fulfillment-orders/:id/release',
    getAuth,
    isAuth,
    requirePermission('delivery.any.update'),
    postReleaseFulfillmentOrder
);

// PATCH /delivery/shipments/:id — correct a tracking code (RFC 7396).
router.patch(
    '/shipments/:id',
    getAuth,
    isAuth,
    requirePermission('delivery.any.update'),
    patchShipment
);

// POST /delivery/shipments/:id/deliver — records an arrival; on the last one the order moves
// shipped -> delivered. Same `forced` step-up as the shipping door above.
router.post(
    '/shipments/:id/deliver',
    getAuth,
    isAuth,
    requirePermission('delivery.any.update'),
    requireFreshAuthWhen(isForcedRequest, 'critical'),
    postDeliverShipment
);
