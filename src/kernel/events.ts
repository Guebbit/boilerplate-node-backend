/**
 * Domain events — the only sanctioned way for two modules to talk when neither can own the other.
 *
 * The import rule says a module may reach a sibling's public barrel, and `dependsOn` says that
 * reach must form a DAG. Some relationships are genuinely mutual: deleting a product has to empty
 * it out of every cart, while the cart needs the product catalogue to price a line. Expressed as
 * imports that is a cycle; expressed here it is products emitting and cart listening, and the
 * dependency arrow points one way only.
 *
 * The payload map is open by design. A module declares its own events by augmenting
 * `DomainEventMap` from inside its own folder, so adding a domain never edits a shared file —
 * which is the whole point of the registry it belongs to.
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

type DomainEventName = Extract<keyof DomainEventMap, string>;

type DomainEventHandler<TEventName extends DomainEventName> = (
    payload: DomainEventMap[TEventName]
) => unknown;

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
 * Drop every subscription. Test seam: suites that register modules per case would otherwise
 * accumulate handlers across cases and see one emit fire N times.
 *
 * It is a function shipped to production for the benefit of tests, and that is a real cost rather
 * than a nitpick: nothing stops application code from calling it and silently unsubscribing every
 * module. Seven suites depend on it, so it is load-bearing.
 *
 * The shape that would not need it is a bus **instance** owned by the registry rather than the
 * module-level map above: a fresh registry means a fresh bus, and the reset becomes the
 * constructor. The cost is that `onDomainEvent`/`emitDomainEvent` stop being importable functions
 * and have to be reached through something — a larger change than the seam is annoying, which is
 * why it has not been made. Whoever does make it is also deciding where subscription lives
 * (`AppModule.subscribe`), because those are the same question.
 */
export const resetDomainEvents = (): void => {
    handlers.clear();
};
