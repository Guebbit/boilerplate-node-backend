/**
 * @module
 * Domain events — the sanctioned way two modules talk when neither can own the other.
 *
 * The import graph must stay acyclic — `no-circular` in `.dependency-cruiser.cjs` refuses one — but
 * some relationships are genuinely mutual: deleting a product empties it out of every cart, while
 * the cart needs the catalogue to price a line. As imports that is a cycle; as an event it is
 * products emitting and cart listening, and the arrow points one way.
 *
 * Not a substitute for the broker — no durability, no retry, no replay.
 *
 * See: docs/tools/events-and-logging.md#the-domain-event-bus-and-what-it-is-not
 */

import { logger } from '@infrastructure/adapters/logger';

/**
 * Event name → payload. Augmented per module; see `modules/products/events.ts` for the shape.
 *
 * Intentionally empty here: this is the extension point, and its members live with the domains
 * that emit them rather than in a list that every new domain has to edit.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- a declaration-merging seam: each module augments this map with its own events
export interface DomainEventMap {}

/** The literal event names {@link DomainEventMap} declares, as a string union. */
type DomainEventName = Extract<keyof DomainEventMap, string>;

/** A subscriber for one event name, narrowed to that event's own payload type. */
type DomainEventHandler<TEventName extends DomainEventName> = (
    payload: DomainEventMap[TEventName]
) => unknown;

/** Event name → its subscribed handlers, in subscription order. */
const handlers = new Map<string, ((payload: never) => unknown)[]>();

/**
 * Subscribe to a domain event.
 *
 * Call from a module's `subscribe()` hook rather than at import time, so the set of live handlers
 * is decided by `src/modules.ts` and not by whichever file something happened to import first.
 *
 * @param name - the event name
 * @param handler - invoked with the payload; may be async
 */
export const onDomainEvent = <TEventName extends DomainEventName>(
    name: TEventName,
    handler: DomainEventHandler<TEventName>
): void => {
    const existing = handlers.get(name) ?? [];
    existing.push(handler as (payload: never) => unknown);
    handlers.set(name, existing);
};

/**
 * Emit a domain event and wait for every handler to settle.
 *
 * Handlers run **sequentially and awaited**, because the emitters here depend on the effect having
 * happened: a product is removed from carts before it is removed from the database. Fire-and-forget
 * would turn an ordering guarantee into a race.
 *
 * A throwing handler is logged and does not stop the remaining handlers or the emitter. A listener
 * that fails must not roll back an operation that has already been authorised — the emitting module
 * decides what its own failure modes are, and it cannot do that for code it has never heard of.
 *
 * @param name - the event name
 * @param payload - the event payload
 */
export const emitDomainEvent = async <TEventName extends DomainEventName>(
    name: TEventName,
    payload: DomainEventMap[TEventName]
): Promise<void> => {
    // Caught per handler, so one subscriber's failure cannot stop the ones queued behind it.
    for (const handler of handlers.get(name) ?? [])
        // eslint-disable-next-line no-restricted-syntax -- caught per handler: one subscriber's failure must not stop the ones queued behind it
        try {
            await (handler as DomainEventHandler<TEventName>)(payload);
        } catch (error) {
            logger.error(`Domain event handler failed for "${name}"`, error);
        }
};

/**
 * Drop every subscription. Test seam: suites registering modules per case would otherwise
 * accumulate handlers and see one emit fire N times.
 *
 * Shipped to production for the benefit of tests, and that is a real cost — nothing stops
 * application code from calling it and silently unsubscribing every module.
 *
 * See: docs/tools/events-and-logging.md#resetdomainevents-is-a-test-seam-with-a-real-cost
 */
export const resetDomainEvents = (): void => {
    handlers.clear();
};
