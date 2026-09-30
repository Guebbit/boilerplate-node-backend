/**
 * @module
 * Domain events — the sanctioned way two modules talk when neither can own the other. The import
 * graph must stay acyclic (`no-circular` in `.dependency-cruiser.cjs`), but some relationships are
 * genuinely mutual — a deleted product empties every cart, while cart needs the catalogue to
 * price a line — so as an event, not an import, the arrow points one way. Not a substitute for the
 * broker: no durability, no retry, no replay.
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

/**
 * The literal event names {@link DomainEventMap} declares, as a string union. Exported so a caller
 * that only learns a domain event's name at runtime (`kernel/registry.ts`'s `resolvePublicEvents`,
 * collected off a module manifest rather than a compile-time literal) has a name for the cast that
 * hands it back to {@link onDomainEvent}.
 */
export type DomainEventName = Extract<keyof DomainEventMap, string>;

/**
 * What travels beside a payload. Empty for an in-process emit; the outbox relay (`./outbox`)
 * fills it, so a consumer that must not act twice has something stable to dedupe on.
 */
export interface DomainEventMeta {
    /**
     * Stable across every redelivery of one event — the outbox row's id. Absent for a plain emit,
     * which has no redelivery to dedupe.
     */
    eventId?: string;
}

/** A subscriber for one event name, narrowed to that event's own payload type. */
type DomainEventHandler<TEventName extends DomainEventName> = (
    payload: DomainEventMap[TEventName],
    meta: DomainEventMeta
) => unknown;

/** Event name → its subscribed handlers, in subscription order. */
const handlers = new Map<string, ((payload: never, meta: DomainEventMeta) => unknown)[]>();

/**
 * Whether the modules have subscribed in THIS process. The outbox relay reads it: dispatching an
 * event in a process where nothing is subscribed would "succeed" with no listener and mark the
 * row published, losing it. Only `registerModules` sets it.
 */
let wired = false;

/** Called by `registerModules` once every module's `subscribe()` has run. */
export const markDomainEventsWired = (): void => {
    wired = true;
};

/** See {@link markDomainEventsWired}. */
export const domainEventsWired = (): boolean => wired;

/**
 * Subscribe to a domain event.
 *
 * Call from a module's `subscribe()` hook rather than at import time, so the set of live handlers
 * is decided by `src/modules.ts` and not by whichever file something happened to import first.
 *
 * @param name - the event name
 * @param handler - invoked with the payload and its {@link DomainEventMeta}; may be async
 */
export const onDomainEvent = <TEventName extends DomainEventName>(
    name: TEventName,
    handler: DomainEventHandler<TEventName>
): void => {
    const existing = handlers.get(name) ?? [];
    existing.push(handler);
    handlers.set(name, existing);
};

/**
 * Emit a domain event and wait for every handler to settle.
 *
 * Handlers run **sequentially and awaited** so two listeners on the same payload never race each
 * other, and the emitter can await the whole cascade rather than fire-and-forget it. This is
 * orthogonal to WHEN an emitter fires: a past-tense event (`products`' `product.deleted`) fires
 * only after its own write actually lands, precisely so a handler here is never awaited for an
 * effect the emitter hasn't earned the right to claim yet.
 *
 * A throwing handler is logged and does not stop the remaining handlers or the emitter. A listener
 * that fails must not roll back an operation that has already been authorised — the emitting module
 * decides what its own failure modes are, and it cannot do that for code it has never heard of.
 *
 * The return says whether they all got through, which is a different question from whether the
 * emit was allowed to proceed. An emitter that has written down an intention to retry — `orders`'
 * `pendingEffects` — needs it to know whether the intention is discharged; every other caller
 * ignores it and keeps the old fire-and-continue behaviour.
 *
 * @param name - the event name
 * @param payload - the event payload
 * @param meta - see {@link DomainEventMeta}; only the outbox relay passes one
 * @returns `true` when every handler resolved, `false` when at least one threw
 */
export const emitDomainEvent = async <TEventName extends DomainEventName>(
    name: TEventName,
    payload: DomainEventMap[TEventName],
    meta: DomainEventMeta = {}
): Promise<boolean> => {
    let settled = true;

    // Caught per handler, so one subscriber's failure cannot stop the ones queued behind it.
    for (const handler of handlers.get(name) ?? [])
        // eslint-disable-next-line no-restricted-syntax -- caught per handler: one subscriber's failure must not stop the ones queued behind it
        try {
            await (handler as DomainEventHandler<TEventName>)(payload, meta);
        } catch (error) {
            settled = false;
            // Stryker disable next-line all
            logger.error(`Domain event handler failed for "${name}"`, error);
        }

    return settled;
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
    wired = false;
};
