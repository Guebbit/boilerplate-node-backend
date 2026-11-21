/**
 * @module
 * Domain events this module emits, declared in `./asyncapi.domain-events.yaml`. Every one rides the
 * transactional outbox, written in the transaction of the act that caused it, so it exists exactly
 * when the act does. `shipment.*` is projected into `webhooks`' public catalogue by `module.ts`'s
 * `publicEvents`; the `fulfillment_order.*` events are internal.
 */

import type { DomainEventMap, DomainEventName } from '@kernel/events';

/**
 * The payloads below are the generated ones (`asyncapi.domain-events.yaml`), kept under the names
 * the module's callers already use.
 */

/** The payload of both `shipment.*` events. */
export type ShipmentEventPayload = DomainEventMap['shipment.delivered'];

/** What a shipment carries, per product — the lines of a `shipment.*` payload. */
export type ShipmentEventLine = ShipmentEventPayload['lines'][number];

/** The payload of `shipment.lost`: the shared one, plus the reason and what the buyer is told. */
export type ShipmentLostPayload = DomainEventMap['shipment.lost'];

/** What the buyer is told is still owed after a loss: a product the shelf could not cover. */
export type ShipmentLostOwedLine = ShipmentLostPayload['owed'][number];

/** The payload of `shipment.shipped`: the shared one, plus what the buyer's mail says. */
export type ShipmentShippedPayload = DomainEventMap['shipment.shipped'];

/** What a `fulfillment_order.delayed` event tells: the dates, and nothing the buyer must answer. */
export type FulfillmentOrderDelayed = DomainEventMap['fulfillment_order.delayed'];

/** What a `fulfillment_order.hold_noticed` event tells: a hold the buyer can act on or should read about. */
export type FulfillmentOrderHoldNoticed = DomainEventMap['fulfillment_order.hold_noticed'];

/** See the `shipment.shipped` channel in `asyncapi.domain-events.yaml`. */
export const SHIPMENT_SHIPPED = 'shipment.shipped' satisfies DomainEventName;

/** See the `shipment.delivered` channel in `asyncapi.domain-events.yaml`. */
export const SHIPMENT_DELIVERED = 'shipment.delivered' satisfies DomainEventName;

/** See the `shipment.lost` channel in `asyncapi.domain-events.yaml`. */
export const SHIPMENT_LOST = 'shipment.lost' satisfies DomainEventName;

/** See the `fulfillment_order.held` channel in `asyncapi.domain-events.yaml`. */
export const FULFILLMENT_ORDER_HELD = 'fulfillment_order.held' satisfies DomainEventName;

/** See the `fulfillment_order.hold_noticed` channel in `asyncapi.domain-events.yaml`. */
export const FULFILLMENT_ORDER_HOLD_NOTICED =
    'fulfillment_order.hold_noticed' satisfies DomainEventName;

/** See the `fulfillment_order.released` channel in `asyncapi.domain-events.yaml`. */
export const FULFILLMENT_ORDER_RELEASED = 'fulfillment_order.released' satisfies DomainEventName;

/** See the `fulfillment_order.canceled` channel in `asyncapi.domain-events.yaml`. */
export const FULFILLMENT_ORDER_CANCELED = 'fulfillment_order.canceled' satisfies DomainEventName;

/** See the `fulfillment_order.delayed` channel in `asyncapi.domain-events.yaml`. */
export const FULFILLMENT_ORDER_DELAYED = 'fulfillment_order.delayed' satisfies DomainEventName;
