/**
 * @module
 * Domain events this module emits, declared in `./asyncapi.domain-events.yaml`. `orders` sits low in
 * the dependency graph — payments and delivery depend on it, never the reverse — so announcing
 * is the only way it can tell them anything.
 */

import type { DomainEventName } from '@kernel/events';

/** Exported so an emitter and its listeners share one spelling instead of duplicated literals. */
export const ORDER_CANCELED = 'order.canceled' satisfies DomainEventName;

/** See the `order.status_changed` channel in `asyncapi.domain-events.yaml`. */
export const ORDER_STATUS_CHANGED = 'order.status_changed' satisfies DomainEventName;

/** See the `order.created` channel in `asyncapi.domain-events.yaml`. */
export const ORDER_CREATED = 'order.created' satisfies DomainEventName;

/** See the `order.status_overridden` channel in `asyncapi.domain-events.yaml`. */
export const ORDER_STATUS_OVERRIDDEN = 'order.status_overridden' satisfies DomainEventName;

/** See the `order.billing_corrected` channel in `asyncapi.domain-events.yaml`. */
export const ORDER_BILLING_CORRECTED = 'order.billing_corrected' satisfies DomainEventName;

/** See the `order.redacted` channel in `asyncapi.domain-events.yaml`. */
export const ORDER_REDACTED = 'order.redacted' satisfies DomainEventName;

/** See the `order.purchase_hold_placed` channel in `asyncapi.domain-events.yaml`. */
export const ORDER_PURCHASE_HOLD_PLACED = 'order.purchase_hold_placed' satisfies DomainEventName;
