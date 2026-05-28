import { logger } from '@utils/winston';
import type { ICartCheckedOutEvent } from '@types';

/**
 * Maps canonical AsyncAPI channel names (dot-notation) to their payload types.
 * The event name IS the AsyncAPI channel name — no separate camelCase alias needed.
 */
export type TDomainEventPayloadMap = {
    readonly 'ecommerce.cart.checked_out': ICartCheckedOutEvent;
};

export type TDomainEventName = keyof TDomainEventPayloadMap;

/**
 * Shared in-process event target for domain events.
 * External adapters (e.g. message brokers) can subscribe here to forward events.
 */
export const domainEvents = new EventTarget();

/**
 * Emits a typed domain event using its canonical AsyncAPI channel name.
 * Logs the event and dispatches it on the shared in-process EventTarget.
 */
export const emitDomainEvent = <K extends TDomainEventName>(
    eventName: K,
    payload: TDomainEventPayloadMap[K]
): void => {
    logger.info('domain_event', { event: eventName, payload });
    domainEvents.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
};
