/**
 * @module
 * The order lifecycle — which status may follow which, and who may make the move. The SET of
 * statuses is generated from the contract; this file adds the edges and the actor each belongs
 * to, on the edge itself so nothing can drift. `updateStatusIfIn` in `../repository.ts` makes one
 * racing writer win — this table only decides which `from` set it is handed.
 *
 * See `docs/theory/tactical-ddd.md` §1.
 */

import { OrderStatus } from '@types';
import type { OrderActions } from '@types';
import { ORDER_STATUS_TRAITS } from './status-traits';

/**
 * `system` is not a rank above `admin` — it is narrower: moves nobody may make by hand.
 * `withdrawal` is the consumer's right of withdrawal (Directive Art. 9): a buyer's own act, wider
 * than an ordinary customer cancel — it reaches `processing` too.
 */
export type OrderActor = 'customer' | 'admin' | 'system' | 'withdrawal';

/**
 * One named move of the lifecycle.
 *
 * Fields:
 *   from:   the statuses it may start from — also the conditional write's own `from` set
 *   to:     the status it lands on
 *   actors: who may make it
 */
export interface OrderEvent {
    readonly from: readonly OrderStatus[];
    readonly to: OrderStatus;
    readonly actors: readonly OrderActor[];
}

/**
 * The lifecycle, keyed by the event that makes each move. The edge, its actors and the `from` set
 * a conditional write is handed all live on one entry, so a service names the event and reads
 * nothing else — no `from` is guessed from the other columns.
 *
 * `system` events follow a fact another module already recorded; a request never makes them.
 */
export const ORDER_EVENTS = {
    /** The payment settled. `payments` is the only caller — nothing else may set `paid`. */
    pay: { from: [OrderStatus.pending], to: OrderStatus.paid, actors: ['system'] },
    /**
     * Fulfilment started, recorded through `delivery`'s own door (`start:Shipment`). `admin`
     * reaches `processing` only through the override door (`canOverrideTo`).
     */
    start: { from: [OrderStatus.paid], to: OrderStatus.processing, actors: ['system'] },
    /** The last unit left, as `delivery` records it. */
    ship: { from: [OrderStatus.processing], to: OrderStatus.shipped, actors: ['system'] },
    /** The last shipment arrived, as `delivery` records it. */
    deliver: { from: [OrderStatus.shipped], to: OrderStatus.delivered, actors: ['system'] },
    /**
     * The order became complete in one act: a digital fulfilment (the one `processing -> delivered`
     * edge), or a remainder cancel that lands after every shipment arrived.
     */
    fulfilmentComplete: {
        from: [OrderStatus.processing],
        to: OrderStatus.delivered,
        actors: ['system']
    },
    /**
     * The reservation sweep's expiry of an unpaid hold. Deliberately its own event: the sweep
     * must never cancel an order that landed a payment in the same race, which `cancelBeforeDispatch`
     * legitimately may (an operator's or buyer's own choice, not a stale deadline).
     */
    expire: { from: [OrderStatus.pending], to: OrderStatus.cancelled, actors: ['system'] },
    /** A buyer's or operator's cancel before fulfilment started. */
    cancel: {
        from: [OrderStatus.pending, OrderStatus.paid],
        to: OrderStatus.cancelled,
        actors: ['customer', 'admin', 'withdrawal']
    },
    /** A cancel once fulfilment started: staff or the right of withdrawal, never the buyer's own. */
    cancelInFulfilment: {
        from: [OrderStatus.processing],
        to: OrderStatus.cancelled,
        actors: ['admin', 'withdrawal']
    }
} as const satisfies Record<string, OrderEvent>;

/** The name of one lifecycle event. */
export type OrderEventName = keyof typeof ORDER_EVENTS;

/** Every event, as a list — what the edge queries below walk. */
const EVERY_EVENT: readonly OrderEvent[] = Object.values(ORDER_EVENTS);

/**
 * @param from - current status
 * @param to - status being written
 * @param actor - who is writing it
 * @returns whether `actor` may make the move — only a declared edge is a transition, so staying in
 * the same status is never one. A repeated settlement is stopped by the conditional write's own
 * `from` filter, not by this table.
 */
export const canTransition = (from: OrderStatus, to: OrderStatus, actor: OrderActor): boolean =>
    EVERY_EVENT.some(
        (event) => event.to === to && event.from.includes(from) && event.actors.includes(actor)
    );

/**
 * Whether an order in `status` may still be paid — the one question every payment door asks
 * instead of comparing a status literal of its own. `pending` only: the one status with a
 * `system` edge into `paid`.
 * @param status - current status
 * @returns whether a payment attempt against this order should be allowed
 */
export const isPayable = (status: OrderStatus): boolean =>
    canTransition(status, OrderStatus.paid, 'system');

/** The `start` event's `from` set, widened once so `includes` accepts any status. */
const STARTABLE_FROM: readonly OrderStatus[] = ORDER_EVENTS.start.from;

/**
 * Whether fulfilment may start on an order in `status` — `paid` only. Keyed on the `start` event's
 * own `from`, not on `canTransition`: that is exactly the set `markProcessing`'s conditional write
 * uses, so a pre-check and the write can never disagree.
 * @param status - current status
 * @returns whether `delivery`'s start door (or a forced first shipment) may move the order on
 */
export const canStartFulfilment = (status: OrderStatus): boolean => STARTABLE_FROM.includes(status);

/**
 * Whether the order's goods are still to be handed over — `paid` or `processing`: money in, nothing
 * out. `shipped` and `delivered` orders have had their goods handed over, so a fulfillment order
 * for them would offer to ship twice; a hold on a finished or cancelled order means nothing.
 * @param status - current status
 * @returns whether fulfilment work (making, holding, releasing, awaiting an answer) still applies
 */
export const isAwaitingGoods = (status: OrderStatus): boolean =>
    ORDER_STATUS_TRAITS[status].stockCommitted && ORDER_STATUS_TRAITS[status].beforeDispatch;

/** The `ship` event's `from` set, widened once so `includes` accepts any status. */
const SHIPPABLE_FROM: readonly OrderStatus[] = ORDER_EVENTS.ship.from;

/**
 * Whether a shipment may leave, or a digital fulfilment may complete, on an order in `status` —
 * `processing` only, the `from` of `ship` and of `fulfilmentComplete` alike.
 * @param status - current status
 * @returns whether shipping (or completing a digital order) is open
 */
export const canShip = (status: OrderStatus): boolean => SHIPPABLE_FROM.includes(status);

/**
 * Whether a shipment's arrival may be recorded on an order in `status`. `processing` counts
 * because one shipment can land while the others are still unshipped; `delivered` and `cancelled`
 * are over.
 * @param status - current status
 * @returns whether an arrival can be taken
 */
export const canRecordArrival = (status: OrderStatus): boolean =>
    status === OrderStatus.processing || status === OrderStatus.shipped;

/**
 * Whether the shop has begun on the order: anything past `paid`, `cancelled` included — a cancel
 * after the start still means the shop was at work, which the right of cancellation reads as
 * "started". `pending` and `paid` are the two statuses before the first fulfilment move.
 * @param status - current status
 * @returns whether the order is past the point where nothing had been done to it
 */
export const hasShopStarted = (status: OrderStatus): boolean =>
    !isPayable(status) && !canStartFulfilment(status);

/**
 * Whether an order in `status` has already been paid — `paid`, or further along. `pending` has
 * only a stock hold, and `cancelled` gave it up. The one place this fact is declared, so a caller
 * deciding whether a hold's commit is still owed never hand-lists the same statuses.
 * @param status - current status
 * @returns whether the order's hold should be (or already is) `committed` or later
 */
export const paymentSettled = (status: OrderStatus): boolean =>
    ORDER_STATUS_TRAITS[status].stockCommitted;

/**
 * The forward sequence an admin override may move an order along — never `paid` (that destination
 * stays `system`-only in absolute terms, see {@link canTransition}) and never
 * `cancelled` (that has its own endpoint, with its own refund/stock-release sequence). Order in
 * this array IS the "forward" rule: an override may only move to a LATER index than the order's
 * current status sits at within it. `pending` is not in it: leaving `pending` goes only through the
 * offline-payment door, which records the money and issues the invoice.
 */
const OVERRIDABLE_SEQUENCE: readonly OrderStatus[] = [
    OrderStatus.paid,
    OrderStatus.processing,
    OrderStatus.shipped,
    OrderStatus.delivered
];

/**
 * Whether an admin override may move an order from `from` to `to` — forward-only, and only ever
 * landing on `processing`/`shipped`/`delivered`. Deliberately its own rule, not a widened
 * {@link canTransition}: an override exists precisely to skip a `from` gate the normal lifecycle
 * enforces, so reusing that table here would defeat the feature it is called from.
 * @param from - the order's current status
 * @param to - the status an override is being asked to move it to
 * @param digitalOnly - whether every line is digital: such an order has no parcel to have left, so
 *   `shipped` is never a target (it goes `processing → delivered` through fulfilment)
 * @returns whether the move is a legal forward override
 */
export const canOverrideTo = (from: OrderStatus, to: OrderStatus, digitalOnly = false): boolean => {
    if (digitalOnly && to === OrderStatus.shipped) return false;

    // Stryker disable next-line ConditionalExpression: equivalent, `paid`/`pending`/`cancelled` fail the index test below anyway.
    if (to !== OrderStatus.processing && to !== OrderStatus.shipped && to !== OrderStatus.delivered)
        return false;

    const fromIndex = OVERRIDABLE_SEQUENCE.indexOf(from);
    const toIndex = OVERRIDABLE_SEQUENCE.indexOf(to);
    // `from` not in the sequence at all (`pending`, which only the offline-payment door leaves, or `cancelled`) → no override lands on it.
    return fromIndex !== -1 && toIndex > fromIndex;
};

/**
 * Every status an override starting FROM `from` could legally land on — for a caller building
 * "what could I move this order to".
 * @param from - the order's current status
 * @param digitalOnly - whether every line is digital, see {@link canOverrideTo}
 * @returns every status later than `from` in the overridable sequence, in contract order
 */
export const overridableTargetsFrom = (
    from: OrderStatus,
    digitalOnly = false
): readonly OrderStatus[] =>
    OVERRIDABLE_SEQUENCE.filter((to) => canOverrideTo(from, to, digitalOnly));

/**
 * @param from - current status
 * @param actor - who is asking
 * @returns statuses `actor` may move to from `from`, in contract order — what a 409 should offer
 */
export const statusesReachableFrom = (
    from: OrderStatus,
    actor: OrderActor
): readonly OrderStatus[] =>
    Object.values(OrderStatus).filter((to) => to !== from && canTransition(from, to, actor));

/**
 * @param to - status being reached
 * @param actor - who is reaching it
 * @returns statuses that may precede `to`, in contract order — feeds `updateStatusIfIn`'s `from` set
 */
export const statusesLeadingTo = (to: OrderStatus, actor: OrderActor): readonly OrderStatus[] =>
    Object.values(OrderStatus).filter((from) => from !== to && canTransition(from, to, actor));

/**
 * The part of `OrderActions` this status/actor pairing alone can answer — `start`/`ship`/
 * `deliver`/`override` need the caller's actual permission keys (a warehouse operator holds
 * `start:Shipment` without `update:Order`, and `actor` alone cannot tell them apart from
 * a customer), so `services/scope.ts`'s `withActions` computes those and merges them in.
 */
type StatusDerivedActions = Pick<OrderActions, 'transitions' | 'cancel' | 'pay'>;

/**
 * What `actor` may do to an order in `status`, as far as the status/actor pairing alone answers —
 * the shape a client renders its controls from, once `withActions` merges in the rest.
 * @param status - current status
 * @param actor - who is asking
 * @returns the caller's options for this order
 */
export const orderActionsFor = (status: OrderStatus, actor: OrderActor): StatusDerivedActions => {
    // Both fields off ONE reading, so they cannot describe different orders.
    const transitions = statusesReachableFrom(status, actor);
    return {
        transitions: [...transitions],
        cancel: transitions.includes(OrderStatus.cancelled),
        // Asked as `system`, and so absent from `transitions`: paying is a move no request makes.
        // A client needs the answer anyway — it is what decides whether to offer the card form on
        // an order that has no payment record yet.
        pay: isPayable(status)
    };
};
