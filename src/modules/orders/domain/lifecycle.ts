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

/** `system` is not a rank above `admin` — it is narrower: moves nobody may make by hand. */
export type OrderActor = 'customer' | 'admin' | 'system';

/**
 * The lifecycle, as a total map from each status to the moves it permits.
 * Total over `OrderStatus` so a new contract status is a compile error, not a silent dead end;
 * terminal states carry `{}` for the same reason.
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
 * @param from - current status
 * @param to - status being written
 * @param actor - who is writing it
 * @returns whether the move is allowed — always true when `from === to` (not a transition)
 */
export const canTransition = (from: OrderStatus, to: OrderStatus, actor: OrderActor): boolean =>
    from === to || Boolean(ORDER_LIFECYCLE[from][to]?.includes(actor));

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
 * What `actor` may do to an order in `status` — the shape a client renders its controls from.
 * @param status - current status
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
