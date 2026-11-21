/**
 * @module
 * Domain events the wishlist emits, declared in `./asyncapi.domain-events.yaml`.
 */

import type { DomainEventName } from '@kernel/events';

/** The event name, exported so an emitter and its listeners share one spelling. */
export const WISHLIST_ITEMS_REMOVED = 'wishlist.items_removed' satisfies DomainEventName;
