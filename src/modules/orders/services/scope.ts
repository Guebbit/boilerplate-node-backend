/**
 * @module
 * Who may read which order, and what they may do to it. The two questions every other file here
 * asks before it writes: `callerScope` narrows the read, `actorOf` picks the lifecycle column,
 * `withActions` puts the answer on the wire.
 */

import { callerForSubject, isSystemActor } from '@kernel/permissions';
import { holds } from '@kernel/ability';
import type { AuthContext, Order, OrderActions } from '@types';
import type { OrderDocument } from '../model';
import { accessibleFilter } from '@kernel/access/query';
import { orderRepository } from '../repository';
import { OrderStatus } from '@types';
import {
    orderActionsFor,
    canStartFulfilment,
    overridableTargetsFrom,
    isDigitalOnlyOrder,
    isPayable,
    canCorrectAddress,
    canWithdraw,
    withdrawalRefusalOf,
    shipsAwaitedStock,
    isBuyer,
    hardDeletable,
    softDeletable
} from '../domain';
import type { OrderActor } from '../domain';
import { resolveCurrentImages } from './current';
import { presentOrder } from '../presenter';

/**
 * Which orders a caller is allowed to read — the authorization boundary for order reads: own
 * orders vs everyone's, and a soft-deleted order visible or not, compiled from the caller's RULES
 * rather than assembled by hand — see `@kernel/access/query`'s `accessibleFilter` for why that is
 * the one encoding of "own AND still there" this module trusts. `{}` for a role that reads
 * everything ("no restriction"), never `undefined` — both spread into a query the same way, and
 * `{}` is what "these are the conditions, and there are none" honestly looks like.
 */
export const callerScope = (context?: AuthContext) => accessibleFilter(context, 'Order');

/**
 * Which orders a caller may CANCEL — the write's own scope, never the read one. A warehouse
 * operator or a support agent can READ every order (`display:Order`) without being allowed to
 * cancel any: asking `callerScope` here would have scoped a write by a read key.
 *
 * - an operator (`update:Order`): the update scope, every live order that key reaches;
 * - anyone else, or a withdrawal (the consumer's own right, never an operator's): the caller's own
 *   live orders, and nothing at all for a caller with no id.
 *
 * @param authContext - the caller; `SYSTEM_ACTOR` for a sweep
 * @param ownOnly - `true` for a withdrawal, which only the buyer may exercise
 */
export const cancelScope = (
    authContext: AuthContext | undefined,
    ownOnly = false
): Record<string, unknown> =>
    actorOf(authContext) === 'customer' || ownOnly
        ? authContext
            ? ownLiveScope(authContext.id)
            : accessibleFilter(undefined, 'Order', 'update')
        : accessibleFilter(authContext, 'Order', 'update');

/**
 * One account's orders, by id rather than by `AuthContext`, WITHOUT excluding soft-deleted rows —
 * for a caller that already knows whose orders it wants regardless of a request's role
 * (`account`'s data export).
 *
 * @param userId - whose orders
 */
export const ownerScope = (userId: string): Record<string, unknown> =>
    orderRepository.ownerScope(userId);

/**
 * One account's orders that still exist: {@link ownerScope} without the soft-deleted rows. The one
 * spelling of "this buyer's own live orders", so a sibling module never has to know `orders` marks
 * a deletion with `deletedAt`.
 *
 * @param userId - whose orders
 */
export const ownLiveScope = (userId: string): Record<string, unknown> => ({
    ...ownerScope(userId),
    deletedAt: null
});

/**
 * Which column of the lifecycle table a caller reads. Three actors reach this function, only two
 * of them over HTTP; `system` names moves that follow a fact from outside the application — the
 * reservation-sweep expiry is the one caller that passes `SYSTEM_ACTOR` here instead of a request's
 * own `AuthContext`, and no request may claim the same column by holding the admin role alone.
 *
 * `SYSTEM_ACTOR` carries `roles.tenant: 'admin'` for every ORDINARY permission check, so this must
 * ask the identity question FIRST — an `authContext && holds(...)` check alone would read it as
 * a plain admin and hand the sweep's expiry the admin column's wider `cancelled` rule, exactly the
 * race this rule closes (see `../domain/lifecycle.ts`'s own comment on `pending.cancelled`).
 *
 * Otherwise gated on `update:Order` by name, the same key `cancelOnRequestById` asks for its own
 * operator/customer split — a broader check would have missed a moderator or manager and
 * silently reduced them to the customer's lifecycle column.
 * @returns the actor whose permissions apply
 */
export const actorOf = (authContext?: AuthContext): OrderActor => {
    if (isSystemActor(authContext)) return 'system';
    return authContext && holds(callerForSubject(authContext, 'Order'), 'update', 'Order')
        ? 'admin'
        : 'customer';
};

/**
 * `delivery`'s start door, plus `orders`' own override — neither decided by `actorOf`'s
 * customer/admin split, since a warehouse operator holds `start:Shipment` without
 * `update:Order` and would otherwise read as a plain customer. Each is asked of the caller's
 * OWN key, at the same tenant scope `actorOf` already resolves. The ship, deliver and fulfil doors
 * are not here: they act on a fulfillment order or a shipment, each of which carries its own
 * `actions` (`delivery`'s presenter).
 * @param order - the order being served
 * @param authContext - the caller, or `undefined` for no request behind this read
 */
const startAndOverrideActions = (
    order: OrderDocument,
    authContext: AuthContext | undefined
): Pick<OrderActions, 'start' | 'override' | 'correctAddress'> => {
    if (!authContext) return { start: false, override: [], correctAddress: false };

    const { status } = order;
    const caller = callerForSubject(authContext, 'Order');
    // The start event's own question, the same one `markProcessing`'s conditional write asks.
    const reachesProcessing = canStartFulfilment(status);
    return {
        start: holds(caller, 'start', 'Shipment') && reachesProcessing,
        correctAddress: holds(caller, 'update', 'Order') && canCorrectAddress(order),
        // The door's own stock guard, so no target is offered that answers 409.
        override: holds(caller, 'override', 'Order')
            ? overridableTargetsFrom(status, isDigitalOnlyOrder(order.items)).filter(
                  (to) => !shipsAwaitedStock(to, order.fulfillment)
              )
            : []
    };
};

/**
 * The status-derived actions with the cancel withdrawn once anything has shipped: a cancel is the
 * WHOLE order, and goods that left cannot be cancelled. What remains is cancelled one fulfillment
 * order at a time through `returns`, which `GET /returns/options` answers.
 * @param actions - what the status and actor alone allow
 * @param shipped - the order's `fulfillment.shipped`
 */
const withoutCancelOnceShipped = <T extends { transitions: OrderStatus[]; cancel: boolean }>(
    actions: T,
    shipped: boolean
): T =>
    shipped
        ? {
              ...actions,
              transitions: actions.transitions.filter((to) => to !== OrderStatus.cancelled),
              cancel: false
          }
        : actions;

/**
 * The operator's "record a payment by hand" button: offered while the order can still reach
 * `paid` and the caller holds the key the offline route asks for.
 *
 * @param status - the order's current status
 * @param authContext - the caller, or `undefined` for no request behind this read
 */
const canRecordPayment = (status: OrderStatus, authContext: AuthContext | undefined): boolean =>
    authContext !== undefined &&
    isPayable(status) &&
    holds(callerForSubject(authContext, 'Order'), 'create', 'Payment');

/**
 * Whether the caller may spend a basket at all — the key `POST /payments/intent` and the other card
 * steps ask. `pay` is offered only to a caller who holds it: an unproven address is told to confirm it,
 * so it is not offered a step the server refuses.
 *
 * @param authContext - the caller, or `undefined` for no request behind this read
 */
const holdsCheckout = (authContext: AuthContext | undefined): boolean =>
    authContext !== undefined && holds(callerForSubject(authContext, 'Order'), 'checkout', 'Cart');

/**
 * The withdrawal button, decided here so no client counts days: offered to the order's own buyer
 * while nothing refuses it (`withdrawalRefusalOf`: a made-to-order-only order, a closed window, a
 * return that took everything back). The refusal rides along as `withdrawBlocked` so a client shows
 * the button disabled with the reason instead of hiding it. An operator reading someone else's
 * order is not offered it — the right is the consumer's to exercise. `withdrawUntil` rides along
 * only once the clock has started, so a client can say "until 12 June" without ever computing it.
 * @param order - the order being served
 * @param authContext - the caller, or `undefined` for no request behind this read
 */
const withdrawalActions = (
    order: OrderDocument,
    authContext: AuthContext | undefined
): Pick<OrderActions, 'withdraw' | 'withdrawBlocked' | 'withdrawUntil'> => {
    const buyer = isBuyer(order, authContext);
    const now = new Date();
    const refusal = buyer ? withdrawalRefusalOf(order, now) : undefined;

    return {
        withdraw: buyer && canWithdraw(order, now),
        ...(refusal ? { withdrawBlocked: refusal } : {}),
        ...(order.withdrawUntil ? { withdrawUntil: order.withdrawUntil.toISOString() } : {})
    };
};

/**
 * `DELETE /orders/{id}` and its `?hardDelete=true` form: the caller holds the delete key and the
 * order is in a state the door accepts — the same predicates the door asks (`remove.ts`).
 * @param order - the order being served
 * @param authContext - the caller, or `undefined` for no request behind this read
 */
const deleteActions = (
    order: OrderDocument,
    authContext: AuthContext | undefined
): Pick<OrderActions, 'delete' | 'hardDelete'> => {
    if (!authContext) return { delete: false, hardDelete: false };
    const mayDelete = holds(callerForSubject(authContext, 'Order'), 'delete', 'Order');
    return {
        delete: mayDelete && !order.deletedAt && softDeletable(order),
        hardDelete: mayDelete && hardDeletable(order)
    };
};

/**
 * The actions as the caller's standing allows them: the status-derived moves for the order's buyer
 * (a customer actor) or for an operator, who holds the key; paying is the buyer's own step.
 *
 * @param actions - everything the caller's keys and the order's status allow
 * @param actor - which lifecycle column the caller reads
 * @param buyer - whether the caller is the order's own buyer
 */
const forStanding = (actions: OrderActions, actor: OrderActor, buyer: boolean): OrderActions => {
    const mayMove = actor === 'customer' ? buyer : true;

    return {
        ...actions,
        transitions: mayMove ? actions.transitions : [],
        cancel: mayMove && actions.cancel,
        // Paying is the buyer's own step; an operator reading the order is never offered it.
        pay: buyer && actions.pay
    };
};

/**
 * The single-order response body: the order as it serializes, plus what this caller may do to
 * it — `actions` must ride on the wire shape or the schema's transform drops it. `async` for
 * `resolveCurrentImages`'s `$in` lookup — the one thing here that isn't a synchronous transform.
 * @returns the serialized order carrying its `actions` and each line's live `current` picture
 */
export const withActions = (order: OrderDocument, authContext?: AuthContext): Promise<Order> => {
    const serialized = presentOrder(order);
    const actor = actorOf(authContext);
    const statusActions = withoutCancelOnceShipped(
        orderActionsFor(order.status, actor),
        order.fulfillment?.shipped === true
    );

    return resolveCurrentImages([serialized]).then(([resolved]) => ({
        ...resolved,
        actions: forStanding(
            {
                ...statusActions,
                pay: statusActions.pay && holdsCheckout(authContext),
                ...startAndOverrideActions(order, authContext),
                ...withdrawalActions(order, authContext),
                recordPayment: canRecordPayment(order.status, authContext),
                ...deleteActions(order, authContext),
                // `paidAt` is stamped in the SAME write that moves an order to `paid`
                // (`repository.ts#markPaid`), so it is a same-module, no-dependency proxy for
                // "an invoice was issued" — `invoicing` freezes one from the very same
                // transition, in its own event listener. `GET /orders/{id}/invoice` (owned by
                // `invoicing`) still checks for real and 404s on the rare gap this flag cannot
                // see — the same "gaps are acceptable" policy `orderNumber` already lives under.
                invoice: Boolean(order.paidAt)
            },
            actor,
            isBuyer(order, authContext)
        )
    }));
};
