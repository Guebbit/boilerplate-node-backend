/**
 * @module
 * Domain events — the sanctioned way two modules talk when neither can own the other. The import
 * graph must stay acyclic (`no-circular` in `.dependency-cruiser.cjs`), but some relationships are
 * genuinely mutual — a deleted product empties every cart, while cart needs the catalogue to
 * price a line — so as an event, not an import, the arrow points one way. Not a substitute for the
 * broker: no durability, no retry, no replay.
 *
 * @see docs/understand/events-and-logging.md#the-domain-event-bus-and-what-it-is-not
 */

import { logger } from '@infrastructure/adapters/logger';
import type { DomainEventMap, DomainEventName } from '@types';

/**
 * Event name → payload, and the names as a union: generated from the `domain-events` section of
 * `asyncapi.yaml` (each emitting module's `asyncapi.domain-events.yaml`). A new event is declared
 * there, never here. Re-exported so a caller keeps one import for the bus and its types; a caller
 * that only learns a name at runtime (`kernel/registry.ts`'s `resolvePublicEvents`) casts to
 * {@link DomainEventName} to hand it to {@link onDomainEvent}.
 *
 * @see docs/understand/events-and-logging.md#the-domain-event-bus-and-what-it-is-not
 */
export type { DomainEventMap, DomainEventName } from '@types';

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
 * emit was allowed to proceed. The outbox relay needs it to know whether to deliver a row again;
 * every other caller ignores it and keeps the fire-and-continue behaviour.
 *
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
            // `{ error }`, not the bare error: a bare one is spread onto the record with its stack.
            // Stryker disable next-line all
            logger.error(`Domain event handler failed for "${name}"`, { error });
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
 * @see docs/understand/events-and-logging.md#resetdomainevents-is-a-test-seam-with-a-real-cost
 */
export const resetDomainEvents = (): void => {
    handlers.clear();
    wired = false;
};
