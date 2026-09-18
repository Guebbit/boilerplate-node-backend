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
        // `system`, not `admin`: this follows a parcel's handover being recorded through
        // `delivery`'s own door, never a direct admin write — see
        // `src/modules/orders/services/status.ts`'s `markShipped`.
        [OrderStatus.shipped]: ['system'],
        [OrderStatus.cancelled]: ['admin']
    },
    [OrderStatus.shipped]: {
        // `system` likewise — a parcel's arrival, recorded through `delivery`'s own door. See
        // `src/modules/orders/services/status.ts`'s `markDelivered`.
        [OrderStatus.delivered]: ['system']
    },
    [OrderStatus.delivered]: {},
    [OrderStatus.cancelled]: {}
};

/**
 * @param from - current status
 * @param to - status being written
 * @param actor - who is writing it
 * @returns whether the move is allowed — `from === to` is not a transition and always allowed,
 * EXCEPT into `paid`: the contract restricts that destination to `system` in absolute terms, so an
 * echo write must not let a non-system actor pass. `system` still gets the no-op, for the payment
 * webhook's own retries.
 */
export const canTransition = (from: OrderStatus, to: OrderStatus, actor: OrderActor): boolean =>
    from === to
        ? to !== OrderStatus.paid || actor === 'system'
        : Boolean(ORDER_LIFECYCLE[from][to]?.includes(actor));

/**
 * Whether an order in `status` may still be paid — the one question every payment door asks
 * instead of comparing a status literal of its own. `pending` only: `canTransition` alone also
 * answers `true` for `paid → paid`, since `system` may echo-write it on the webhook's own retries,
 * but that echo is not a fresh offer to pay — a caller asking "can I pay this" must get `false`
 * once it already has been.
 * @param status - current status
 * @returns whether a payment attempt against this order should be allowed
 */
export const isPayable = (status: OrderStatus): boolean =>
    canTransition(status, OrderStatus.paid, 'system') && status !== OrderStatus.paid;

/**
 * The forward sequence an admin override may move an order along — never `paid` (that destination
 * stays `system`-only in absolute terms, echo included, see {@link canTransition}) and never
 * `cancelled` (that has its own endpoint, with its own refund/stock-release sequence). Order in
 * this array IS the "forward" rule: an override may only move to a LATER index than the order's
 * current status sits at within it.
 */
const OVERRIDABLE_SEQUENCE: readonly OrderStatus[] = [
    OrderStatus.pending,
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
 * @returns whether the move is a legal forward override
 */
export const canOverrideTo = (from: OrderStatus, to: OrderStatus): boolean => {
    if (to !== OrderStatus.processing && to !== OrderStatus.shipped && to !== OrderStatus.delivered)
        return false;

    const fromIndex = OVERRIDABLE_SEQUENCE.indexOf(from);
    const toIndex = OVERRIDABLE_SEQUENCE.indexOf(to);
    // `from` not in the sequence at all (already `cancelled`) → no override lands on it.
    return fromIndex !== -1 && toIndex > fromIndex;
};

/**
 * Every status a forced or status-only override starting from `to` could have legally come FROM —
 * the conditional write's own `from` set, the same shape {@link markSystemMove}'s single-status
 * version needs but computed dynamically here since an override's `from` is not fixed to one value.
 * @param to - the status being written
 * @returns every status strictly earlier than `to` in the overridable sequence
 */
export const statusesOverridableInto = (to: OrderStatus): readonly OrderStatus[] => {
    const toIndex = OVERRIDABLE_SEQUENCE.indexOf(to);
    return toIndex === -1 ? [] : OVERRIDABLE_SEQUENCE.slice(0, toIndex);
};

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
        pay: isPayable(status)
    };
};
