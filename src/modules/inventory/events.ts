/**
 * @module
 * Domain events this module emits — declared in `./asyncapi.domain-events.yaml`.
 * Stock changes are not events (see `products/events.ts`): the counter and the row explaining it
 * are one write. Of the four below, `stock_retaken` is this module's own refresh (its listener is
 * in `module.ts`); the other three reach other modules. A hold timing out is why `orders` cancels
 * the order, and it is an event because `orders` already imports this module and must not be
 * imported back. `backorder_allocated` is an event for the same reason: `delivery` imports this
 * module only for the event's name.
 *
 * @see docs/modules/inventory.md#the-pipeline
 */

import type { DomainEventName } from '@kernel/events';

/**
 * The event name, exported through the barrel so an emitter and its listeners share one
 * spelling rather than two string literals that typo independently.
 */
export const RESERVATION_EXPIRED = 'inventory.reservation_expired' satisfies DomainEventName;

/** See the `inventory.backorder_allocated` channel in `asyncapi.domain-events.yaml` for what it carries and who listens. */
export const PREORDER_ALLOCATED = 'inventory.backorder_allocated' satisfies DomainEventName;

/** See the `inventory.stock_retaken` channel in `asyncapi.domain-events.yaml`; announced by the payment's own transaction. */
export const STOCK_RETAKEN = 'inventory.stock_retaken' satisfies DomainEventName;

/** See the `inventory.hold_orphaned` channel in `asyncapi.domain-events.yaml`. */
export const HOLD_ORPHANED = 'inventory.hold_orphaned' satisfies DomainEventName;
