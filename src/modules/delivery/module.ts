/**
 * @module
 * Delivery: shipping rates, fulfillment orders and shipments. Depends on orders because a
 * fulfillment order is about an order, and reaches stock, mail and the buyer's language through
 * `orders`' own doors. The rates live in `./domain` as pure functions so the cart's checkout can
 * price a method without this module's HTTP surface. Shipping is specific to how this shop operates
 * but isn't what anyone buys here — worth its own rules in `domain/`, not worth an aggregate.
 *
 * Listens to three `orders` events (all through the outbox): `paid` makes the fulfillment orders,
 * `cancelled` cancels them, and `status_overridden` brings the shipments in step with a status set
 * by hand. Two more come from siblings: `inventory`'s `preorder_allocated` releases the fulfillment
 * order that waited for the stock, and `products`' `release_date_changed` tells the buyers who
 * already paid that their date moved.
 *
 * See: docs/modules/delivery.md
 */

import path from 'node:path';
import type { AppModule, PublicEventTarget } from '@kernel/registry';
import { onDomainEvent, type DomainEventMap } from '@kernel/events';
import {
    orderService,
    ORDER_CANCELLED,
    ORDER_STATUS_CHANGED,
    ORDER_STATUS_OVERRIDDEN
} from '@modules/orders';
import { PREORDER_ALLOCATED } from '@modules/inventory';
import { PRODUCT_RELEASE_DATE_CHANGED } from '@modules/products';
import { OrderStatus } from '@types';
import { router } from './routes';
import { deliveryConfig } from './config';
import { deliveryService } from './services';
import { presentExportFulfillmentOrder, presentExportShipment } from './presenter';
// Also installs this module's event declarations. Reached directly, never through this module's
// own barrel — see CLAUDE.md's module-barrel rule.
import {
    FULFILLMENT_ORDER_DELAYED,
    FULFILLMENT_ORDER_HOLD_NOTICED,
    SHIPMENT_DELIVERED,
    SHIPMENT_SHIPPED,
    type ShipmentEventPayload
} from './events';
import { deliveryJobs } from './jobs';

/**
 * What both `shipment.*` webhooks carry: the shipment, its fulfillment order and what is in it.
 * @param payload - the domain event's payload
 */
const shipmentData = (payload: ShipmentEventPayload) => ({
    orderId: payload.orderId,
    shipmentId: payload.shipmentId,
    fulfillmentOrderId: payload.fulfillmentOrderId,
    lines: payload.lines.map(({ productId, quantity }) => ({ productId, quantity }))
});

/**
 * This module's public (webhook-visible) events, projected by `webhooks` through
 * `kernel/registry.ts`'s `resolvePublicEvents` — the same registry every other module uses, so
 * `webhooks` never imports this module by name. One per shipment: an order shipped in two goes
 * announces twice.
 */
const publicEvents: Readonly<Record<string, PublicEventTarget>> = {
    [SHIPMENT_SHIPPED]: {
        toPublicEvent: (payload: DomainEventMap[typeof SHIPMENT_SHIPPED]) => ({
            eventType: 'shipment.shipped',
            data: shipmentData(payload)
        })
    },
    [SHIPMENT_DELIVERED]: {
        toPublicEvent: (payload: DomainEventMap[typeof SHIPMENT_DELIVERED]) => ({
            eventType: 'shipment.delivered',
            data: shipmentData(payload)
        })
    }
};

/** This module's manifest entry: routes, the export sections, event wiring and locales. */
export default {
    name: 'delivery',
    basePath: '/delivery',
    routes: router,
    jobs: deliveryJobs,
    config: [deliveryConfig.slice],
    publicEvents,
    personalData: [
        {
            section: 'shipments',
            // `delivery -> orders` already exists (see the module docblock); the read itself needs
            // the caller's own order ids first — `orders` publishes `ownOrderIds` for exactly this,
            // so this module never has to page through full order documents (or navigate
            // `.search()`'s own `_id`/`id` normalization trap) just to get them.
            collect: (subject) =>
                orderService
                    .ownOrderIds(subject.userId)
                    .then((orderIds) => deliveryService.findShipmentsForOrders(orderIds))
                    .then((shipments) =>
                        shipments.map((shipment) => presentExportShipment(shipment))
                    )
        },
        {
            section: 'fulfillmentOrders',
            collect: (subject) =>
                orderService
                    .ownOrderIds(subject.userId)
                    .then((orderIds) => deliveryService.findFulfillmentOrdersForOrders(orderIds))
                    .then((all) => all.map((one) => presentExportFulfillmentOrder(one)))
        }
    ],
    /*
     * None of the first three requests a fact — each reacts to one `orders` already recorded and
     * announced. A failure is logged by `emitDomainEvent`, and the outbox retries it; the missing
     * fulfillment orders a lost `paid` would leave are made again by the next read or `start`.
     */
    subscribe: () => {
        onDomainEvent(ORDER_STATUS_CHANGED, ({ orderId, to }) =>
            to === OrderStatus.paid ? deliveryService.ensureFulfillmentOrders(orderId) : undefined
        );
        onDomainEvent(ORDER_CANCELLED, ({ orderId }) => deliveryService.cancelAllForOrder(orderId));
        onDomainEvent(ORDER_STATUS_OVERRIDDEN, ({ orderId, to, at }) =>
            deliveryService.syncWithOverride(orderId, to, new Date(at))
        );
        onDomainEvent(PREORDER_ALLOCATED, ({ orderId, productId, waiting }) =>
            deliveryService.releaseAllocated(orderId, productId, waiting)
        );
        // This module's own three mails, from its own facts — see `./services/notify.ts`.
        onDomainEvent(SHIPMENT_SHIPPED, deliveryService.mailShipped);
        onDomainEvent(SHIPMENT_DELIVERED, deliveryService.mailDelivered);
        onDomainEvent(FULFILLMENT_ORDER_DELAYED, deliveryService.mailDelayed);
        onDomainEvent(FULFILLMENT_ORDER_HOLD_NOTICED, deliveryService.mailHoldNoticed);
        onDomainEvent(PRODUCT_RELEASE_DATE_CHANGED, ({ productId }) =>
            deliveryService.onReleaseDateChanged(productId)
        );
    },
    locales: path.join(__dirname, 'locales'),
    templates: path.join(__dirname, 'templates')
} satisfies AppModule;
