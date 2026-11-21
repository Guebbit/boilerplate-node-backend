/**
 * @module
 * Domain events this module emits, declared in `./asyncapi.domain-events.yaml`.
 */

import type { DomainEventName } from '@kernel/events';

/**
 * The event names, exported through the barrel so an emitter and its listeners share one
 * spelling rather than two string literals that typo independently.
 */
export const PRODUCT_DELETED = 'product.deleted' satisfies DomainEventName;

/** The event name listeners subscribe to; the payload is in `DomainEventMap`. */
export const PRODUCT_CREATED = 'product.created' satisfies DomainEventName;

/** The event name `delivery` subscribes to for a moved release date. */
export const PRODUCT_RELEASE_DATE_CHANGED =
    'product.release_date_changed' satisfies DomainEventName;

/** The event name `delivery` subscribes to for a moved restock date. */
export const PRODUCT_RESTOCK_DATE_CHANGED =
    'product.restock_date_changed' satisfies DomainEventName;

/** The event name `inventory` subscribes to when anything that decides a product's availability changed. */
export const PRODUCT_TERMS_CHANGED = 'product.terms_changed' satisfies DomainEventName;
