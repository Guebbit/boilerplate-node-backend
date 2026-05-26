import { EventEmitter } from 'node:events';
import { logger } from '@utils/winston';
import type { ICartCheckedOutEvent } from '@utils/realtime-contracts';

// Registry of domain event names and their payload types.
// Each entry maps a canonical event name (used by the emitter) to its payload interface.
export type TDomainEventPayloadMap = {
    readonly cartCheckedOut: ICartCheckedOutEvent;
};

export type TDomainEventName = keyof TDomainEventPayloadMap;

// Dot-notation channel names as used in asyncapi.yaml — keyed by the camelCase event name.
export const DOMAIN_EVENT_CHANNELS: Record<TDomainEventName, string> = {
    cartCheckedOut: 'ecommerce.cart.checked_out'
};

// Shared in-process event target. Future Kafka/broker adapters can subscribe here
// and forward events to the message bus without changing call-sites.
export const domainEvents = new EventTarget();

// Emits a typed domain event: logs it for observability and dispatches it in-process.
export const emitDomainEvent = <K extends TDomainEventName>(
    eventName: K,
    payload: TDomainEventPayloadMap[K]
): void => {
    const channel = DOMAIN_EVENT_CHANNELS[eventName];
    logger.info('domain_event', { event: channel, payload });
    domainEvents.dispatchEvent(new CustomEvent(channel, { detail: payload }));
};
