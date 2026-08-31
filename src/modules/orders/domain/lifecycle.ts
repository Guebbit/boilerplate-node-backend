/**
 * @module
 * The order lifecycle — which status may follow which, and who may make the move.
 *
 * The SET of statuses belongs to the contract (`OrderStatus` is generated from `openapi.yaml`);
 * this file adds the edges between them and the actor each edge belongs to, on the edge itself
 * rather than a second table that could drift. Deciding and enforcing stay separate:
 * `updateStatusIfIn` in `../repository.ts` makes one racing writer win, and this table only
 * decides which `from` set it is handed.
 *
 * See `docs/theory/tactical-ddd.md` §1.
 */

import { OrderStatus } from '@types';
import type { OrderActions } from '@types';

/** `system` is not a rank above `admin` — it is narrower: moves nobody may make by hand. */
export type OrderActor = 'customer' | 'admin' | 'system';

/**
 * The lifecycle, as a total map from each status to the moves it permits.
 *
 * Total over `OrderStatus` so a seventh status added to the contract is a compile error rather than
 * one an order can never leave. The terminal states carry `{}` for the same reason — an omitted key
 * would read as an oversight.
 */
export const ORDER_LIFECYCLE: Readonly<
    Record<OrderStatus, Readonly<Partial<Record<OrderStatus, readonly OrderActor[]>>>>
> = {
    [OrderStatus.pending]: {
        [OrderStatus.paid]: ['system'],
        [OrderStatus.cancelled]: ['customer', 'admin']
    },
    [OrderStatus.paid]: {
        [OrderStatus.processing]: ['admin'],
        [OrderStatus.cancelled]: ['customer', 'admin']
    },
    [OrderStatus.processing]: {
        [OrderStatus.shipped]: ['admin'],
        [OrderStatus.cancelled]: ['admin']
    },
    [OrderStatus.shipped]: {
        [OrderStatus.delivered]: ['admin']
    },
    [OrderStatus.delivered]: {},
    [OrderStatus.cancelled]: {}
};

/**
 * May `actor` move an order from `from` to `to`?
 *
 * A write that changes nothing answers `true`: it is not a transition, and treating it as one would
 * make every unrelated field edit a lifecycle question.
 *
 * @param from - the status the order is in
 * @param to - the status being written
 * @param actor - who is writing it
 * @returns whether the lifecycle allows the move
 */
export const canTransition = (from: OrderStatus, to: OrderStatus, actor: OrderActor): boolean =>
    from === to || Boolean(ORDER_LIFECYCLE[from][to]?.includes(actor));

/**
 * Every status `actor` may move an order to from `from`. The forward reading of the table.
 *
 * What a refusal owes the caller: a 409 that names the moves still open beats one that says only no.
 *
 * @param from - the status the order is in
 * @param actor - who is asking
 * @returns the reachable statuses, in contract order
 */
export const statusesReachableFrom = (
    from: OrderStatus,
    actor: OrderActor
): readonly OrderStatus[] =>
    Object.values(OrderStatus).filter((to) => to !== from && canTransition(from, to, actor));

/**
 * Every status from which `actor` may reach `to`. The backward reading.
 *
 * This is what feeds `updateStatusIfIn`'s `from` set, which is why no caller declares a status
 * literal of its own.
 *
 * @param to - the status being reached
 * @param actor - who is reaching it
 * @returns the statuses that may precede `to`, in contract order
 */
export const statusesLeadingTo = (to: OrderStatus, actor: OrderActor): readonly OrderStatus[] =>
    Object.values(OrderStatus).filter((from) => from !== to && canTransition(from, to, actor));

/**
 * What `actor` may do to an order in `status`, as the contract's `OrderActions`.
 *
 * The shape a client renders its controls from. Assembled here rather than in the controller so
 * that "what may I do" and "what is legal" are one answer: a client offering a control the server
 * would refuse is the drift this exists to stop.
 *
 * @param status - the status the order is in
 * @param actor - who is asking
 * @returns the caller's options for this order
 */
export const orderActionsFor = (status: OrderStatus, actor: OrderActor): OrderActions => {
    // Both fields off ONE reading, so they cannot describe different orders. `canTransition` is
    // the wrong question here: it allows a write that changes nothing, which is right for an edit
    // that repeats the current status and wrong for "may I cancel this" on an order already
    // cancelled. `statusesReachableFrom` excludes the current status, which is the answer wanted.
    const transitions = statusesReachableFrom(status, actor);
    return {
        transitions: [...transitions],
        cancel: transitions.includes(OrderStatus.cancelled),
        // Asked as `system`, and so absent from `transitions`: paying is a move no request makes.
        // A client needs the answer anyway — it is what decides whether to offer the card form on
        // an order that has no payment record yet.
        pay: canTransition(status, OrderStatus.paid, 'system') && status !== OrderStatus.paid
    };
};
