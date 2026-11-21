/**
 * @module
 * Domain events the cart emits, declared in `./asyncapi.domain-events.yaml`.
 */

import type { DomainEventName } from '@kernel/events';

/** Event names, exported so an emitter and its listeners share one spelling. */
export const CART_LINES_REMOVED = 'cart.lines_removed' satisfies DomainEventName;

/** See the `cart.merge_refused` channel in `asyncapi.domain-events.yaml`. */
export const CART_MERGE_REFUSED = 'cart.merge_refused' satisfies DomainEventName;
