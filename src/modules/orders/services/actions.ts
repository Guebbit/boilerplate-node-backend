/**
 * @module
 * What a caller may do to an order, decided here so no client re-derives the rules. Two halves:
 * the state half ("can this order do X in its status") is pure and lives in `../domain`, shared
 * with the write path's guard so flag and guard cannot disagree; this file adds the caller (keys,
 * ownership). `withActions` puts the answer on one order's wire shape, `withListActions` on a
 * page of rows.
 */

import { callerForSubject } from '@kernel/permissions';
import { holds } from '@kernel/ability';
import type { AuthContext, ExportOrder, Order, OrderActions } from '@types';
import type { OrderDocument } from '../model';
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
import { toObjectId, type Lean } from '@infrastructure/persistence/create-repository';
import type { PaginatedMeta } from '@infrastructure/persistence/search';
import { resolveCurrentImages } from './current';
import { presentOrder } from '../presenter';
import { actorOf } from './scope';

/**
 * An order as the flags read it: the hydrated document (a single read) or a lean row (a page).
 * The flags read plain fields only, so both fit.
 */
type OrderForActions = Lean<OrderDocument>;

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
    order: OrderForActions,
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
const withoutCancelOnceShipped = <T extends { cancel: boolean }>(
    actions: T,
    shipped: boolean
): T => (shipped ? { ...actions, cancel: false } : actions);

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
 * Whether the caller may spend a basket at all — the key `POST /payments` and the other card
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
 * order is not offered it — the right is the consumer's to exercise.
 * @param order - the order being served
 * @param authContext - the caller, or `undefined` for no request behind this read
 */
const withdrawalActions = (
    order: OrderForActions,
    authContext: AuthContext | undefined
): Pick<OrderActions, 'withdraw' | 'withdrawBlocked'> => {
    const buyer = isBuyer(order, authContext);
    const now = new Date();
    const refusal = buyer ? withdrawalRefusalOf(order, now) : undefined;

    return {
        withdraw: buyer && canWithdraw(order, now),
        ...(refusal ? { withdrawBlocked: refusal } : {})
    };
};

/**
 * `DELETE /orders/{id}`, its `?hardDelete=true` form and `POST /orders/{id}/restore`: the caller
 * holds the delete key and the order is in a state the door accepts — the same predicates the
 * doors ask (`remove.ts`).
 * @param order - the order being served
 * @param authContext - the caller, or `undefined` for no request behind this read
 */
const deleteActions = (
    order: OrderForActions,
    authContext: AuthContext | undefined
): Pick<OrderActions, 'delete' | 'hardDelete' | 'restore'> => {
    if (!authContext) return { delete: false, hardDelete: false, restore: false };
    const mayDelete = holds(callerForSubject(authContext, 'Order'), 'delete', 'Order');
    return {
        delete: mayDelete && !order.deletedAt && softDeletable(order),
        hardDelete: mayDelete && hardDeletable(order),
        restore: mayDelete && Boolean(order.deletedAt)
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
        cancel: mayMove && actions.cancel,
        // Paying is the buyer's own step; an operator reading the order is never offered it.
        pay: buyer && actions.pay
    };
};

/**
 * Everything this caller may do to this order. Pure: it reads the document and the caller's keys,
 * never the database, so a list can ask it once per row.
 * @param order - the order being served
 * @param authContext - the caller, or `undefined` for no request behind this read
 */
export const orderActionsOf = (
    order: OrderForActions,
    authContext: AuthContext | undefined
): OrderActions => {
    const actor = actorOf(authContext);
    const statusActions = withoutCancelOnceShipped(
        orderActionsFor(order.status, actor),
        order.fulfillment?.shipped === true
    );

    return forStanding(
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
    );
};

/**
 * The single-order response body: the order as it serializes, plus what this caller may do to
 * it — `actions` must ride on the wire shape or the schema's transform drops it. `async` for
 * `resolveCurrentImages`'s `$in` lookup — the one thing here that isn't a synchronous transform.
 * @returns the serialized order carrying its `actions` and each line's live `current` picture
 */
export const withActions = (order: OrderDocument, authContext?: AuthContext): Promise<Order> =>
    resolveCurrentImages([presentOrder(order)]).then(([resolved]) => ({
        ...resolved,
        actions: orderActionsOf(order, authContext)
    }));

/**
 * A page of list rows, each carrying what this caller may do to it. The rows are already wire
 * shape (an aggregation), so the documents the flags need are read back in ONE `$in` query for the
 * whole page, however many rows it holds; the per-row step is pure.
 * @param page - the search result
 * @param authContext - the caller
 * @returns the same page, every row carrying its `actions`
 */
export const withListActions = (
    page: { items: ExportOrder[]; meta: PaginatedMeta },
    authContext: AuthContext | undefined
): Promise<{ items: Order[]; meta: PaginatedMeta }> =>
    page.items.length === 0
        ? Promise.resolve({ items: [], meta: page.meta })
        : orderRepository
              .findAll(
                  { _id: { $in: page.items.map((item) => toObjectId(item.id)) } },
                  { limit: page.items.length }
              )
              .then((documents) => {
                  const byId = new Map(
                      documents.map((document) => [String(document._id), document])
                  );
                  return {
                      // A row whose document vanished between the two reads is gone: it is dropped,
                      // since an `Order` always carries its `actions`.
                      items: page.items.flatMap((item) => {
                          const document = byId.get(item.id);
                          return document
                              ? [{ ...item, actions: orderActionsOf(document, authContext) }]
                              : [];
                      }),
                      meta: page.meta
                  };
              });
