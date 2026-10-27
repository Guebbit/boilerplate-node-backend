/**
 * @module
 * Route table for delivery. Guards are chosen per route: the methods list is pre-purchase
 * information and stays public, the fulfilment read needs a caller to scope ownership to, and every
 * write door is staff's — the same key that updates a shipment, for the write. See:
 * docs/modules/delivery.md
 */

import { Router } from 'express';
import { getAuth, isAuth, requirePermission } from '@kernel/middlewares/authorizations';
import { idempotencyKey } from '@infrastructure/http/middlewares/idempotency';
import { noStore } from '@infrastructure/http/middlewares/cache';
import { getShippingMethods } from './controllers/get-shipping-methods';
import { postShipFulfillmentOrder } from './controllers/post-ship-fulfillment-order';
import { postDeliverShipment } from './controllers/post-deliver-shipment';
import { postMarkShipmentLost } from './controllers/post-mark-shipment-lost';
import { postFulfillFulfillmentOrder } from './controllers/post-fulfill-fulfillment-order';
import {
    postHoldFulfillmentOrder,
    postReleaseFulfillmentOrder
} from './controllers/post-hold-fulfillment-order';
import { getShipment } from './controllers/get-shipment';
import { getFulfillmentOrder } from './controllers/get-fulfillment-order';
import { patchShipment } from './controllers/patch-shipment';
import { getReleaseDateImpact, getRestockDateImpact } from './controllers/get-date-impact';
import {
    getPreorderFulfillmentOrders,
    getPreorderSummary
} from './controllers/get-preorder-fulfillment-orders';

/** Express router for delivery operations (methods, fulfilment reads, cutting and delivering shipments, holds). */
export const router = Router();

// GET /delivery/methods — public: what shipping costs is pre-purchase information
router.get('/methods', getShippingMethods);

// GET /delivery/fulfillment-orders and /summary — the preorder board's reads. `read:Order`, the
// key of the orders they are about, which every signed-in account holds: the service narrows the
// rows to the caller's own orders unless they hold `display:Order` and read every order.
router.get(
    '/fulfillment-orders',
    getAuth,
    isAuth,
    requirePermission('read', 'Order'),
    getPreorderFulfillmentOrders
);
router.get(
    '/fulfillment-orders/summary',
    getAuth,
    isAuth,
    requirePermission('read', 'Order'),
    getPreorderSummary
);

// GET /delivery/fulfillment-orders/release-date-impact — what saving a release date would tell the
// buyers. It exists for the product form, so it needs the key that moves the date, and it counts
// orders, so it needs the key that reads them: an editor moves dates but sees no order volume.
router.get(
    '/fulfillment-orders/release-date-impact',
    getAuth,
    isAuth,
    requirePermission('update', 'Product'),
    requirePermission('display', 'Order'),
    noStore,
    getReleaseDateImpact
);

// GET /delivery/fulfillment-orders/restock-date-impact — the same preview for a restock date, which
// moves the promise of the units a shelf could not cover. Same keys, same reasons.
router.get(
    '/fulfillment-orders/restock-date-impact',
    getAuth,
    isAuth,
    requirePermission('update', 'Product'),
    requirePermission('display', 'Order'),
    noStore,
    getRestockDateImpact
);

// GET /delivery/fulfillment-orders/:id — one fulfillment order. Mounted after the literal paths
// above, so `summary` and the two impact previews are not read as an id.
router.get(
    '/fulfillment-orders/:id',
    getAuth,
    isAuth,
    requirePermission('read', 'Order'),
    getFulfillmentOrder
);

// POST /delivery/fulfillment-orders/:id/shipments — cuts a shipment; the order moves processing ->
// shipped only when nothing remains anywhere. From `paid` the act makes the start move itself, so
// the service also asks for `start:Shipment` there. No step-up: shipping is an ordinary act.
// `idempotencyKey` sits after the permission check so a 401/403 is never stored as the answer: a
// partial ship creates a new shipment, so a retry without a key would cut a second parcel.
router.post(
    '/fulfillment-orders/:id/shipments',
    getAuth,
    isAuth,
    requirePermission('update', 'Shipment'),
    idempotencyKey,
    postShipFulfillmentOrder
);

// POST /delivery/fulfillment-orders/:id/fulfill — the digital door: a shipment with no parcel,
// born delivered. Like shipping, it makes the start move itself from `paid`. A physical
// fulfillment order cannot use this door at all. Keyed like the ship door, so both answer alike.
router.post(
    '/fulfillment-orders/:id/fulfill',
    getAuth,
    isAuth,
    requirePermission('update', 'Shipment'),
    idempotencyKey,
    postFulfillFulfillmentOrder
);

// POST /delivery/fulfillment-orders/:id/hold and /release — staff holding a fulfillment order back.
router.post(
    '/fulfillment-orders/:id/hold',
    getAuth,
    isAuth,
    requirePermission('update', 'Shipment'),
    postHoldFulfillmentOrder
);
router.post(
    '/fulfillment-orders/:id/release',
    getAuth,
    isAuth,
    requirePermission('update', 'Shipment'),
    postReleaseFulfillmentOrder
);

// GET /delivery/shipments/:id and /fulfillment-orders/:id — the item reads. `read:Order` like the
// lists; the service narrows to the caller's own orders unless they hold `display:Order`, and
// answers 404 for what they may not see.
router.get('/shipments/:id', getAuth, isAuth, requirePermission('read', 'Order'), getShipment);

// PATCH /delivery/shipments/:id — correct a tracking code (RFC 7396).
router.patch(
    '/shipments/:id',
    getAuth,
    isAuth,
    requirePermission('update', 'Shipment'),
    patchShipment
);

// POST /delivery/shipments/:id/deliver — records an arrival; on the last one the order moves
// shipped -> delivered. No step-up: recording a fact about a parcel.
router.post(
    '/shipments/:id/deliver',
    getAuth,
    isAuth,
    requirePermission('update', 'Shipment'),
    postDeliverShipment
);
// POST /delivery/shipments/:id/lost — a parcel that will not arrive: its units reopen on the same
// fulfillment order, the stock hold is topped up and the buyer is told. No step-up: it records a
// fact about a parcel, the same weight as recording its arrival.
router.post(
    '/shipments/:id/lost',
    getAuth,
    isAuth,
    requirePermission('update', 'Shipment'),
    postMarkShipmentLost
);
