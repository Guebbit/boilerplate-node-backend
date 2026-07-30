/**
 * Domain events — "something meaningful happened in the business" notifications.
 *
 * Distinct from the other three observability signals: audit records *who did it* for
 * compliance, analytics records *user behaviour* for product, metrics record *how the system
 * is performing* — a domain event is the fact itself, which other parts of the system may
 * react to. It is a decoupling mechanism, not just a recording one.
 *
 * See: docs/api/asyncapi-workflow.md
 */

import { logger } from '@core/adapters/logger';
import type { ICartCheckedOutEvent } from '@types';

/**
 * Maps canonical AsyncAPI channel names (dot-notation) to their payload types.
 * The event name IS the AsyncAPI channel name — no separate camelCase alias needed.
 *
 * This map is the type-level contract: adding a channel here is what makes it emittable, and
 * the mapped payload type is enforced at every call site. Keeping the key identical to the
 * AsyncAPI channel name means the docs, the generated artefacts and the code cannot drift.
 */
export type TDomainEventPayloadMap = {
    readonly 'ecommerce.cart.checked_out': ICartCheckedOutEvent;
};

/** Union of the valid channel names, derived from the map so the two can never disagree. */
export type TDomainEventName = keyof TDomainEventPayloadMap;

/**
 * Shared in-process event target for domain events.
 * External adapters (e.g. message brokers) can subscribe here to forward events.
 *
 * `EventTarget` is the web-standard pub/sub interface, available globally in Node 16+. Chosen
 * over Node's `EventEmitter` because it needs no import and carries the `CustomEvent.detail`
 * convention used below.
 *
 * Scope caveat: this is *in-process only*. Under clustering, a listener registered in one
 * worker never sees events emitted by another — cross-instance fan-out is what the RabbitMQ
 * adapter (or the Redis pub/sub in `adapters/cache`) is for, and this target is the natural
 * place to bridge from.
 */
export const domainEvents = new EventTarget();

/**
 * Emits a typed domain event using its canonical AsyncAPI channel name.
 * Logs the event and dispatches it on the shared in-process EventTarget.
 *
 * The generic `K` ties the two arguments together: `TDomainEventPayloadMap[K]` resolves to the
 * payload type for the *specific* channel passed, so a mismatched payload is a compile error
 * rather than a malformed message discovered by a consumer.
 */
export const emitDomainEvent = <K extends TDomainEventName>(
    eventName: K,
    payload: TDomainEventPayloadMap[K]
): void => {
    // Log unconditionally: this is the durable record. It means an event is not lost just
    // because nothing happened to be listening at the time.
    logger.info('domain_event', { event: eventName, payload });
    // `CustomEvent` carries arbitrary data in its `detail` property — listeners read
    // `(event as CustomEvent).detail` to get the payload back.
    // Dispatch is *synchronous*: listeners run before this call returns, and a listener that
    // throws would propagate into the caller. Keep subscribers cheap and defensive.
    domainEvents.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
};
