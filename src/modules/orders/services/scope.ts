/**
 * @module
 * Who may read which order, and what they may do to it. The two questions every other file here
 * asks before it writes: `callerScope` narrows the read, `actorOf` picks the lifecycle column,
 * `withActions` puts the answer on the wire.
 */

import { callerForSubject, isSystemActor } from '@kernel/permissions';
import { holdsKey } from '@kernel/ability';
import { canActOn, outrankedRefusal, ownMoneyRefusal } from '@modules/access';
import type { ResponseReject } from '@infrastructure/http/response';
import type { AuthContext, CallerContext, Order, OrderActions } from '@types';
import type { OrderDocument } from '../model';
import { accessibleFilter } from '@kernel/access/query';
import { orderRepository } from '../repository';
import { OrderStatus } from '@types';
import {
    orderActionsFor,
    statusesLeadingTo,
    overridableTargetsFrom,
    isDigitalOnlyOrder,
    isPayable,
    canWithdraw
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
 * operator or a support agent can READ every order (`orders.any.read`) without being allowed to
 * cancel any: asking `callerScope` here would have scoped a write by a read key.
 *
 * - an operator (`orders.any.update`): the update scope, every live order that key reaches;
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
            ? { ...ownerScope(authContext.id), deletedAt: null }
            : accessibleFilter(undefined, 'Order', 'update')
        : accessibleFilter(authContext, 'Order', 'update');

/**
 * What a service asks about an order's buyer before a write: the rank rule alone
 * ({@link outrankedRefusal}) or with the own-money rule in front of it ({@link ownMoneyRefusal}).
 */
type BuyerRefusal = typeof outrankedRefusal;

/**
 * {@link BuyerRefusal} for an order already in hand. An order whose buyer is gone (erased) has no
 * owner to outrank.
 *
 * @param ask - which rule to ask of the buyer
 * @param order - the order about to be changed
 * @param context - the caller, or `undefined` for a path with no request behind it
 */
const refusalOnOrder = (
    ask: BuyerRefusal,
    order: Pick<OrderDocument, '_id' | 'userId'>,
    context: CallerContext | undefined
): Promise<ResponseReject | undefined> =>
    ask(context, order.userId ? String(order.userId) : undefined, 'order', String(order._id));

/**
 * {@link refusalOnOrder} for an order known only by id: loads it, unless the caller is one the
 * rules never refuse (no context, or the system actor), in which case there is no read at all.
 *
 * @param ask - which rule to ask of the buyer
 * @param orderId - the order about to be changed
 * @param context - the caller, or `undefined` for a path with no request behind it
 */
const refusalOnOrderId = (
    ask: BuyerRefusal,
    orderId: string,
    context: CallerContext | undefined
): Promise<ResponseReject | undefined> =>
    !context || context.caller.system
        ? Promise.resolve(undefined)
        : orderRepository
              .findById(orderId)
              .then((order) => (order ? refusalOnOrder(ask, order, context) : undefined));

/**
 * The rank rule for an order already in hand: `403 OUTRANKED` when its buyer ranks at or above the
 * caller, else `undefined`. Staff handle other people's orders, never an equal's or a superior's.
 * The caller's OWN order is exempt here: this is the rule for every step but the four that move
 * money, which ask {@link ownMoneyRefusalFor} instead.
 *
 * @param order - the order about to be changed
 * @param context - the caller, or `undefined` for a path with no request behind it
 */
export const outrankedRefusalFor = (
    order: Pick<OrderDocument, '_id' | 'userId'>,
    context: CallerContext | undefined
): Promise<ResponseReject | undefined> => refusalOnOrder(outrankedRefusal, order, context);

/**
 * {@link outrankedRefusalFor} for an order known only by id.
 *
 * @param orderId - the order about to be changed
 * @param context - the caller, or `undefined` for a path with no request behind it
 */
export const outrankedOrderRefusal = (
    orderId: string,
    context: CallerContext | undefined
): Promise<ResponseReject | undefined> => refusalOnOrderId(outrankedRefusal, orderId, context);

/**
 * The refusal for a step that moves an order's money (record cash, refund, approve or receive a
 * return): the caller may not be the buyer, and the buyer must rank below the caller. Nobody
 * handles their own money — a customer promoted to staff, or an administrator who raised an order
 * for themselves, still needs someone else to pay, refund or take back the goods.
 *
 * @param order - the order whose money is about to move
 * @param context - the caller, or `undefined` for a path with no request behind it
 */
export const ownMoneyRefusalFor = (
    order: Pick<OrderDocument, '_id' | 'userId'>,
    context: CallerContext | undefined
): Promise<ResponseReject | undefined> => refusalOnOrder(ownMoneyRefusal, order, context);

/**
 * {@link ownMoneyRefusalFor} for an order known only by id.
 *
 * @param orderId - the order whose money is about to move
 * @param context - the caller, or `undefined` for a path with no request behind it
 */
export const ownMoneyOrderRefusal = (
    orderId: string,
    context: CallerContext | undefined
): Promise<ResponseReject | undefined> => refusalOnOrderId(ownMoneyRefusal, orderId, context);

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
 * Which column of the lifecycle table a caller reads. Three actors reach this function, only two
 * of them over HTTP; `system` names moves that follow a fact from outside the application — the
 * reservation-sweep expiry is the one caller that passes `SYSTEM_ACTOR` here instead of a request's
 * own `AuthContext`, and no request may claim the same column by holding the admin role alone.
 *
 * `SYSTEM_ACTOR` carries `roles.tenant: 'admin'` for every ORDINARY permission check, so this must
 * ask the identity question FIRST — an `authContext && holdsKey(...)` check alone would read it as
 * a plain admin and hand the sweep's expiry the admin column's wider `cancelled` rule, exactly the
 * race this rule closes (see `../domain/lifecycle.ts`'s own comment on `pending.cancelled`).
 *
 * Otherwise gated on `orders.any.update` by name, the same key `cancelById` asks for its own
 * operator/customer split — a broader check would have missed a moderator or manager and
 * silently reduced them to the customer's lifecycle column.
 * @returns the actor whose permissions apply
 */
export const actorOf = (authContext?: AuthContext): OrderActor => {
    if (isSystemActor(authContext)) return 'system';
    return authContext && holdsKey(callerForSubject(authContext, 'Order'), 'orders.any.update')
        ? 'admin'
        : 'customer';
};

/**
 * `delivery`'s four action doors, plus `orders`' own override — none of them decided by
 * `actorOf`'s customer/admin split, since a warehouse operator holds `delivery.any.start` without
 * `orders.any.update` and would otherwise read as a plain customer. Each is asked of the caller's
 * OWN key, at the same tenant scope `actorOf` already resolves — `delivery.any.start`/`.update`
 * and `orders.any.override` are all tenant-scoped keys, so one `callerForSubject(...,'Order')`
 * caller answers all four regardless of which subject each key is declared under.
 *
 * `ship`/`fulfill` are mutually exclusive by construction: `digitalOnly` picks which of the two
 * doors this order could ever go through, `reachesVia(shipped)` picks whether it may go through
 * either RIGHT NOW.
 * @param status - the order's current status
 * @param digitalOnly - whether every line on this order is digital — see `isDigitalOnlyOrder`
 * @param authContext - the caller, or `undefined` for no request behind this read
 */
const deliveryAndOverrideActions = (
    status: OrderStatus,
    digitalOnly: boolean,
    authContext: AuthContext | undefined
): Pick<OrderActions, 'start' | 'ship' | 'deliver' | 'fulfill' | 'override'> => {
    if (!authContext)
        return { start: false, ship: false, deliver: false, fulfill: false, override: [] };

    const caller = callerForSubject(authContext, 'Order');
    // `statusesLeadingTo`, not a raw `canTransition(status, target, 'system')`: the latter
    // answers `true` for an ECHO write (status already equals target, legal for every status but
    // `paid`), which would read e.g. `start` as true for an order already `processing`.
    // `statusesLeadingTo` excludes `from === to` by construction.
    const reachesVia = (target: OrderStatus): boolean =>
        statusesLeadingTo(target, 'system').includes(status);
    const canRecordFulfilment = holdsKey(caller, 'delivery.any.update');
    return {
        start: holdsKey(caller, 'delivery.any.start') && reachesVia(OrderStatus.processing),
        ship: canRecordFulfilment && !digitalOnly && reachesVia(OrderStatus.shipped),
        deliver: canRecordFulfilment && reachesVia(OrderStatus.delivered),
        // `processing → delivered` for a digital-only order — no lifecycle-table entry to ask
        // `reachesVia` about, since `delivery/service.ts`'s `fulfillOrder` gates this move
        // directly rather than through `ORDER_LIFECYCLE` (see `services/status.ts#markFulfilled`).
        fulfill: canRecordFulfilment && digitalOnly && status === OrderStatus.processing,
        override: holdsKey(caller, 'orders.any.override') ? [...overridableTargetsFrom(status)] : []
    };
};

/**
 * The operator's "record a payment by hand" button: offered while the order can still reach
 * `paid` and the caller holds the key the offline route asks for. Rank is applied afterwards by
 * `withinStanding`, like every other operator door.
 *
 * @param status - the order's current status
 * @param authContext - the caller, or `undefined` for no request behind this read
 */
const canRecordPayment = (status: OrderStatus, authContext: AuthContext | undefined): boolean =>
    authContext !== undefined &&
    isPayable(status) &&
    holdsKey(callerForSubject(authContext, 'Order'), 'payments.any.create');

/**
 * The withdrawal button, decided here so no client counts days: offered to the order's own buyer
 * while the order is withdrawable and the window, if it has started, is still open. An operator
 * reading someone else's order is not offered it — the right is the consumer's to exercise.
 * `withdrawUntil` rides along only once the clock has started, so a client can say "until 12 June"
 * without ever computing it.
 * @param order - the order being served
 * @param authContext - the caller, or `undefined` for no request behind this read
 */
const withdrawalActions = (
    order: OrderDocument,
    authContext: AuthContext | undefined
): Pick<OrderActions, 'withdraw' | 'withdrawUntil'> => {
    const isBuyer = String(order.userId) === authContext?.id;
    return {
        // Nothing left to send back once every unit has: `returnStatus` is the projection `returns`
        // stamps, the only way this module can know.
        withdraw: isBuyer && canWithdraw(order, new Date()) && order.returnStatus !== 'returned',
        ...(order.withdrawUntil ? { withdrawUntil: order.withdrawUntil.toISOString() } : {})
    };
};

/**
 * Does the caller's rank reach this order's buyer — the rank rule asked as a question, for a
 * response that tells a client what to render. Yes for a path with no request, for the buyer
 * themselves, and for an order whose buyer is gone.
 *
 * @param order - the order being served
 * @param authContext - the caller, or `undefined` for no request behind this read
 */
export const reachesBuyer = (
    order: Pick<OrderDocument, 'userId'>,
    authContext: AuthContext | undefined
): Promise<boolean> =>
    authContext
        ? canActOn(
              { caller: callerForSubject(authContext, 'Order'), analyticsConsent: false },
              order.userId ? String(order.userId) : undefined
          )
        : Promise.resolve(true);

/**
 * Whether the caller's rank reaches the buyer of one order, by id — {@link reachesBuyer} for a
 * sibling module that holds an order id (a return, a payment) rather than the order. An order
 * that does not exist reaches nobody.
 *
 * @param orderId - the order
 * @param authContext - the caller, or `undefined` for no request behind this read
 */
export const reachesBuyerOf = (
    orderId: string,
    authContext: AuthContext | undefined
): Promise<boolean> =>
    authContext
        ? orderRepository
              .findById(orderId)
              .then((order) => (order ? reachesBuyer(order, authContext) : false))
        : Promise.resolve(true);

/**
 * May the caller move this order's money — {@link reachesBuyer}, and not their own order. The
 * question behind the `actions` flags that {@link ownMoneyRefusalFor} refuses.
 *
 * @param order - the order being served
 * @param authContext - the caller, or `undefined` for no request behind this read
 */
export const handlesMoneyOf = (
    order: Pick<OrderDocument, 'userId'>,
    authContext: AuthContext | undefined
): Promise<boolean> =>
    reachesBuyer(order, authContext).then(
        (reaches) => reaches && String(order.userId) !== authContext?.id
    );

/**
 * {@link handlesMoneyOf} for a sibling module that holds an order id (a return). An order that
 * does not exist is handled by nobody.
 *
 * @param orderId - the order
 * @param authContext - the caller, or `undefined` for no request behind this read
 */
export const handlesMoneyOfOrder = (
    orderId: string,
    authContext: AuthContext | undefined
): Promise<boolean> =>
    authContext
        ? orderRepository
              .findById(orderId)
              .then((order) => (order ? handlesMoneyOf(order, authContext) : false))
        : Promise.resolve(true);

/**
 * What the caller may do to this order beyond what its status allows: every lifecycle move and
 * delivery door is for the order's BUYER (cancel, pay) or for an operator whose rank reaches the
 * buyer, and nobody else. A warehouse or support account reads every order and still gets no
 * cancel; a moderator gets none on a staff member's order.
 *
 * @param order - the order being served
 * @param authContext - the caller, or `undefined` for no request behind this read
 * @returns whether the caller is the buyer, and whether their rank reaches the buyer
 */
const standingOn = (
    order: OrderDocument,
    authContext: AuthContext | undefined
): Promise<{ isBuyer: boolean; reaches: boolean }> =>
    reachesBuyer(order, authContext).then((reaches) => ({
        isBuyer: String(order.userId) === authContext?.id,
        reaches
    }));

/**
 * The actions as `standing` allows them: the status-derived ones only for the buyer (a customer
 * actor) or an operator who reaches the buyer, the delivery and override doors only when the
 * caller's rank reaches the buyer.
 *
 * @param actions - everything the caller's keys and the order's status allow
 * @param actor - which lifecycle column the caller reads
 * @param standing - {@link standingOn}'s answer
 */
const withinStanding = (
    actions: OrderActions,
    actor: OrderActor,
    standing: { isBuyer: boolean; reaches: boolean }
): OrderActions => {
    const mayMove = actor === 'customer' ? standing.isBuyer : standing.reaches;
    const doors = standing.reaches
        ? {}
        : { start: false, ship: false, deliver: false, fulfill: false, override: [] };

    return {
        ...actions,
        ...doors,
        transitions: mayMove ? actions.transitions : [],
        cancel: mayMove && actions.cancel,
        // Paying is the buyer's own step; an operator reading the order is never offered it.
        pay: standing.isBuyer && actions.pay,
        // Recording money by hand is the operator's: over a buyer their rank reaches, never
        // their own order (nobody handles their own money).
        recordPayment: standing.reaches && !standing.isBuyer && actions.recordPayment
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

    return Promise.all([resolveCurrentImages([serialized]), standingOn(order, authContext)]).then(
        ([[resolved], standing]) => ({
            ...resolved,
            actions: {
                ...withinStanding(
                    {
                        ...orderActionsFor(order.status, actor),
                        ...deliveryAndOverrideActions(
                            order.status,
                            isDigitalOnlyOrder(order.items),
                            authContext
                        ),
                        ...withdrawalActions(order, authContext),
                        recordPayment: canRecordPayment(order.status, authContext),
                        // `paidAt` is stamped in the SAME write that moves an order to `paid`
                        // (`repository.ts#markPaid`), so it is a same-module, no-dependency proxy for
                        // "an invoice was issued" — `invoicing` freezes one from the very same
                        // transition, in its own event listener. `GET /orders/{id}/invoice` (owned by
                        // `invoicing`) still checks for real and 404s on the rare gap this flag cannot
                        // see — the same "gaps are acceptable" policy `orderNumber` already lives under.
                        invoice: Boolean(order.paidAt)
                    },
                    actor,
                    standing
                )
            }
        })
    );
};
