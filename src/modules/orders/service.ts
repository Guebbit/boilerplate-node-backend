/**
 * @module
 * Order service: all business logic for the Order entity. Delegates raw database access to the
 * order repository, and stays the one place a controller may call into.
 */

import { getDefaultLocale, t } from '@infrastructure/i18n';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { logger } from '@infrastructure/adapters/logger';
import { orderConfirmEmail } from './emails';
import { OrderStatus } from '@types';
import type { SearchOrdersRequest, CartItem, Caller, UpdateOrderByIdRequest } from '@types';
import type { OrderDocument, OrderDocumentItem } from './model';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { productRepository } from '@modules/products';
import { inventoryService } from '@modules/inventory';
import { emitDomainEvent } from '@kernel/events';
import { createOwnerScope } from '@kernel/authorization';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { ordersAnalyticsEvents } from './analytics';
import { ordersAuditActions } from './audit';
import { ORDER_CANCELLED, ORDER_STATUS_CHANGED } from './events';
import { orderRepository } from './repository';
import {
    canTransition,
    checkOrderLines,
    orderActionsFor,
    statusesLeadingTo,
    statusesReachableFrom
} from './domain';
import type { OrderActor } from './domain';
// `userId` is stored as an ObjectId, so writes have to coerce it. The rule (and its failure
// mode on a malformed id) lives in the repository layer; this is the only import of it here.
import { toObjectId } from '@infrastructure/persistence/create-repository';
import type { PaginatedMeta } from '@infrastructure/persistence/search';

/**
 * Search orders (DTO-friendly) — matches POST /orders/search in OpenAPI. `productId` filters
 * `items.product._id`, since product data is embedded rather than referenced.
 * @param scope - extra filters merged into the $match stage
 * @param context - for the `orders_viewed` emit; omit outside a `GET /orders` request
 */
export const search = (
    search: SearchOrdersRequest = {},
    scope?: Record<string, unknown>,
    context?: CallerContext
): Promise<{
    items: OrderDocument[];
    meta: PaginatedMeta;
}> =>
    orderRepository.search(search, scope).then((result) => {
        if (context)
            emitAnalyticsEvent({
                ...buildAnalyticsBase(context),
                event: ordersAnalyticsEvents.ORDERS_VIEWED
            });
        return result;
    });

/**
 * Get a single order by ID.
 * Returns undefined if id is falsy or if not found.
 *
 * @param id
 * @param scope - Optional extra filter (e.g. restrict to a specific userId)
 */
export const getById = (
    id: string | undefined,
    scope?: Record<string, unknown>
): Promise<OrderDocument | undefined> => {
    if (!id) return Promise.resolve<OrderDocument | undefined>(undefined);
    return orderRepository.findByIdScoped(id, scope);
};

/**
 * Report that an order was created — from the admin route or a customer's checkout
 * (`@modules/cart`'s `orderConfirm`), split out since the two paths' writes share only this
 * fact. `actorRole` defaults to the caller's role, but checkout overrides it to `'user'`: a
 * purchase is a customer action regardless of the account making it.
 */
export const recordCreated = (
    order: OrderDocument,
    context: CallerContext,
    actorRole?: 'user' | 'admin'
): void => {
    emitAuditEvent(
        buildAuditEvent(context, {
            action: ordersAuditActions.ORDER_CREATED,
            outcome: 'success',
            ...(actorRole ? { actor_role: actorRole } : {}),
            target_type: 'order',
            target_id: String(order._id)
        })
    );
    emitAnalyticsEvent({
        ...buildAnalyticsBase(context),
        event: ordersAnalyticsEvents.ORDER_CREATED,
        properties: { order_id: String(order._id) }
    });
};

/**
 * Undo an order the request that wrote it cannot keep — the compensation both this module's
 * `create` and `@modules/cart`'s checkout run when a later step refuses.
 *
 * Never rejects: the refusal it precedes is already the right answer, and a failed cleanup must
 * not report it as a 500. Each step is guarded alone so neither aborts the other; the release
 * goes first, so it still names a live order. A refused reserve deletes the hold row outright,
 * so no sweep can find what is left behind — these logs are the only signal a human gets.
 *
 * @param order - the order being retracted
 * @param releaseHold - whether units are still held against it
 */
export const retractOrder = (order: OrderDocument, releaseHold: boolean): Promise<void> => {
    const orderId = String(order._id);

    // `error.message`, not the Error: the logger serializes as JSON and an Error has no
    // enumerable properties, so the object alone would print `"error":{}`.
    const report = (message: string) => (error: unknown) => {
        logger.error({
            message,
            orderId,
            error: error instanceof Error ? error.message : String(error)
        });
    };

    return (
        releaseHold
            ? inventoryService.releaseForOrder(orderId).catch(report('Rollback: hold not released'))
            : Promise.resolve()
    )
        .then(() => orderRepository.deleteOne(order))
        .catch(report('Rollback: order not deleted'));
};

/**
 * Create a new order from `{ productId, quantity }` items — looks up each product and stores a
 * full snapshot.
 * @param items - `{ productId, quantity }` pairs
 * @param context - caller context for the `order_created` analytics/audit emit
 */
// `async` so `toObjectId(userId)` rejects rather than throws — malformed input must reach the
// caller as a rejected promise like every other failure here. Flat `await`s, not nested
// `.then()`s, for the same reason `@modules/cart`'s `runCheckout` uses them: each step depends
// on the last one's resolved value.
export const create = async (
    userId: string,
    email: string,
    items: CartItem[],
    context: CallerContext
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> => {
    // One rule call, two outcomes. `Promise.all([])` settles without a query, so an empty basket
    // still costs no round trip. The rule is in `domain/rules.ts`; mapping it to a status code
    // and translated copy is this layer's job.
    const resolvedItems = await Promise.all(
        items.map((item) =>
            productRepository.findByIdRaw(item.productId).then((product) => ({ item, product }))
        )
    );

    const verdict = checkOrderLines(
        resolvedItems.map(({ item, product }) => ({ quantity: item.quantity, product }))
    );
    if (!verdict.ok)
        return verdict.reason === 'no-lines'
            ? generateReject(422, [t('generic.error-missing-data')])
            : generateReject(404, [t('products.not-found')]);

    const orderItems: OrderDocumentItem[] = resolvedItems.map(({ item, product }) => ({
        product: product!,
        quantity: item.quantity
    }));

    /*
     * Write the order, then hold its units — a hold is keyed by the order it belongs to, so
     * the order must exist first. The admin path sells the same shelf the storefront does:
     * skipping the hold here is how a manual order oversells it, so this goes through the same
     * `reserveForOrder` — one conditional write per line, all-or-nothing, rolled back by
     * `inventory` if any line can't be covered.
     */
    const order = await orderRepository.create({
        userId: toObjectId(userId),
        email,
        items: orderItems
    });

    const outcome = await inventoryService.reserveForOrder(
        String(order._id),
        resolvedItems.map(({ item }) => ({
            productId: item.productId,
            quantity: item.quantity
        }))
    );
    if (!outcome.held) {
        // Nothing is held — the reserve rolled its own lines back — so only the order goes.
        await retractOrder(order, false);
        return generateReject(409, [
            {
                code: 'ORDER_INSUFFICIENT_STOCK',
                message: t('orders.insufficient-stock'),
                // Which line blocked it, and what is actually on the shelf.
                details: { lines: outcome.shortfalls }
            }
        ]);
    }

    recordCreated(order, context);

    /*
     * The confirmation mail for THIS path only — `recordCreated` is shared with
     * `@modules/cart`'s checkout, which sends its own, so mailing here too would double-send.
     * `context.locale` is the whole language chain: an admin-created order has no recipient
     * record, only a supplied address, so there's no stored preference to prefer over the
     * request's.
     */
    const mail = orderConfirmEmail(context.locale ?? getDefaultLocale(), email, order);
    void enqueueEmail({ to: email, subject: mail.subject }, mail.template, mail.data);

    return generateSuccess(order, 201, t('orders.creation-success'));
};

/**
 * Update an existing order document (admin), only the fields provided. Writes pure-status moves
 * (`processing`, `shipped`, `delivered`); cancellation lives in `cancelById`.
 * @param order
 * @param data
 */
// `async` for the same reason the repositories are: `toObjectId(data.userId)` below throws on a
// malformed id, and a function typed `Promise<T>` must reject rather than throw synchronously.
export const update = async (
    order: OrderDocument,
    data: UpdateOrderByIdRequest
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> => {
    const previousStatus = order.status;

    /*
     * Asked before anything is assigned, so a refusal is never a partial write. The controller's
     * Zod schema already validated the VALUE against the generated enum; what is decided here is
     * whether the MOVE exists. See `docs/theory/tactical-ddd.md` §1.
     */
    const nextStatus = data.status;
    if (nextStatus !== undefined && !canTransition(previousStatus, nextStatus, 'admin'))
        return generateReject(409, [
            {
                code: 'ORDER_TRANSITION_NOT_ALLOWED',
                message: t('orders.transition.not-allowed'),
                details: {
                    from: previousStatus,
                    to: nextStatus,
                    allowed: statusesReachableFrom(previousStatus, 'admin')
                }
            }
        ]);

    /*
     * The lifecycle allows an admin this edge; executing it here does not. A cancellation is a
     * sequence — release the hold, announce `ORDER_CANCELLED` so `payments` refunds — and
     * `POST /orders/{id}/cancel` is where it runs.
     */
    if (nextStatus === OrderStatus.cancelled)
        return generateReject(409, [
            {
                code: 'ORDER_CANCEL_VIA_CANCEL_ENDPOINT',
                message: t('orders.transition.cancel-elsewhere'),
                details: { from: previousStatus, to: nextStatus }
            }
        ]);

    if (nextStatus !== undefined) order.status = nextStatus;
    if (data.email !== undefined) order.email = data.email;
    if (data.userId !== undefined) order.userId = toObjectId(data.userId);

    /*
     * Rewriting the lines is refused while the shelf is holding them: the reservation froze its own
     * copy of the basket, and a later `commitForOrder` would decrement products the order no longer
     * contains. `inventory` owns the question.
     */
    const requestedItems = data.items;
    const updateItemsPromise =
        requestedItems && requestedItems.length > 0
            ? inventoryService.isStockBoundToOrder(String(order._id)).then((bound) => {
                  if (bound)
                      return generateReject(409, [
                          {
                              code: 'ORDER_ITEMS_HELD',
                              message: t('orders.items-held')
                          }
                      ]);

                  return Promise.all(
                      requestedItems.map((item) =>
                          productRepository
                              .findByIdRaw(item.productId)
                              .then((product) => ({ item, product }))
                      )
                  ).then((resolvedItems) => {
                      const missingProduct = resolvedItems.some(({ product }) => !product);
                      if (missingProduct) return generateReject(404, [t('products.not-found')]);

                      order.items = resolvedItems.map(({ item, product }) => ({
                          product: product!,
                          quantity: item.quantity
                      }));
                      return undefined;
                  });
              })
            : Promise.resolve();

    return updateItemsPromise.then((earlyResult) => {
        if (earlyResult) return earlyResult;
        return orderRepository.save(order).then(async (saved) => {
            // Announced after the save: a status is only "changed" once it is on disk, and the
            // listeners (the shipment, one day a notification) compensate for facts, not plans.
            if (saved.status !== previousStatus)
                await emitDomainEvent(ORDER_STATUS_CHANGED, {
                    orderId: String(saved._id),
                    from: previousStatus,
                    to: saved.status
                });
            return generateSuccess(saved);
        });
    });
};

/**
 * Update an existing order by ID (admin).
 * Fetches the document then delegates to update().
 *
 * @param id
 * @param data
 */
export const updateById = (
    id: string,
    data: UpdateOrderByIdRequest,
    context: CallerContext
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> =>
    orderRepository.findById(id).then((order) => {
        // Returned, not thrown: a thrown miss is indistinguishable from a genuine database error
        // at the `.catch()` that has to tell them apart.
        if (!order) return generateReject(404, [t('orders.not-found')]);

        return update(order, data).then((result) => {
            if (result.success)
                emitAuditEvent(
                    buildAuditEvent(context, {
                        action: ordersAuditActions.ORDER_UPDATED,
                        outcome: 'success',
                        target_type: 'order',
                        target_id: id
                    })
                );
            return result;
        });
    });

/**
 * Remove an order document (soft or hard delete). Soft toggles `deletedAt` (restores if already
 * soft-deleted) — an order is a financial record, so hiding it isn't destroying it. Hard gives
 * the units back first: an order holds stock, and destroying the row without releasing it
 * leaves the shelf holding units for nothing, until the TTL sweep records the deletion as an
 * expiry.
 * @param order
 * @param hardDelete
 */
export const remove = (
    order: OrderDocument,
    hardDelete = false
): Promise<ResponseSuccess<OrderDocument> | ResponseSuccess<undefined> | ResponseReject> => {
    // HARD delete
    if (hardDelete)
        return (
            inventoryService
                // Released BEFORE the row goes, so the release can still name the order it
                // belongs to. Whether it released is not checked, for the same reason
                // `cancelById` does not check: a hold that already expired is an ordinary
                // sequence with nothing left to do about it.
                .releaseForOrder(String(order._id))
                .then(() => orderRepository.deleteOne(order))
                .then(() => generateSuccess(undefined, 200, t('orders.hard-deleted')))
        );

    // SOFT delete (or restore) — the default path for an order, which is a financial record.
    // A FLIP, not an assignment: run against an already soft-deleted order this restores it,
    // which is what the `hardDelete: false` half of `hardDeleteSchema` means.
    order.deletedAt = order.deletedAt ? undefined : new Date();
    return orderRepository
        .save(order)
        .then((saved) => generateSuccess(saved, 200, t('orders.soft-deleted')));
};

/**
 * Remove an order by ID (soft or hard delete).
 * Fetches the document then delegates to remove().
 *
 * @param id
 * @param hardDelete
 */
export const removeById = (
    id: string,
    hardDelete = false
): Promise<ResponseSuccess<OrderDocument> | ResponseSuccess<undefined> | ResponseReject> =>
    orderRepository
        .findById(id)
        .then((order) =>
            order ? remove(order, hardDelete) : generateReject(404, [t('orders.not-found')])
        );

/**
 * Which orders a caller is allowed to read — the authorization boundary for order reads: own
 * orders vs everyone's, and a soft-deleted order visible or not. `visibleScope` makes it BOTH;
 * `ownerScope` alone would leave soft-deleted rows visible to their owner. Returns `undefined`
 * for admins ("no restriction"), so callers must spread it, not treat it as a filter — see
 * `createOwnerScope` for why the scope rides in the read.
 */
export const callerScope = createOwnerScope(orderRepository.visibleScope);

/**
 * Which column of the lifecycle table a caller reads. Two actors reach the HTTP surface;
 * `system` names moves that follow a fact from outside the application, and no request may
 * claim it.
 * @returns the actor whose permissions apply
 */
const actorOf = (authContext?: Caller): OrderActor => (authContext?.admin ? 'admin' : 'customer');

/**
 * The single-order response body: the order as it serializes, plus what this caller may do to
 * it — explicit because the two read branches return different shapes, and `actions` must ride
 * on the wire shape or the schema's transform drops it.
 * @returns the serialized order carrying its `actions`
 */
const withActions = (
    order: OrderDocument | undefined,
    authContext?: Caller
): Record<string, unknown> | undefined => {
    // A success envelope types its payload as optional. No order, no actions — the caller's
    // `undefined` passes straight through rather than becoming an empty capability block.
    if (!order) return undefined;
    // `unknown` first, then one assertion: the scoped branch already hands back a normalized plain
    // object typed as a document, so neither shape can be spread without saying so once.
    const serialized: unknown = typeof order.toJSON === 'function' ? order.toJSON() : order;

    return {
        ...(serialized as Record<string, unknown>),
        actions: orderActionsFor(order.status, actorOf(authContext))
    };
};

/**
 * Cancel an order — the one write a customer may make, or the system makes when a reservation
 * times out unpaid. A conditional status move, not read-check-write: the filter carries the
 * caller's scope AND the `pending` requirement, so a racing admin "shipped" (or a double-click)
 * resolves at the storage layer — exactly one write matches. The follow-up read on `null` only
 * tells 404 from 409; the decision is already made.
 * @param context - omitted by the reservation-sweep expiry, which is not a request; still
 *   audited as a system actor and reported under its own analytics name
 */
export const cancelById = (
    id: string,
    authContext?: Caller,
    options: { refund?: boolean } = {},
    context?: CallerContext
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> => {
    /*
     * A customer is always refunded — that is the promise `paid` is cancellable on, and it is not
     * theirs to waive. Only an operator chooses, because only an operator has a reason to cancel
     * without returning the money: a replacement going out, a correction, a refund handled apart.
     */
    const refund = authContext?.admin ? (options.refund ?? true) : true;

    /*
     * The statuses a cancel may move from are read off the lifecycle table, not declared, and the
     * table answers per actor: a customer may cancel from `pending` and `paid`, an operator also
     * from `processing`.
     */
    return orderRepository
        .updateStatusIfIn(
            id,
            statusesLeadingTo(OrderStatus.cancelled, actorOf(authContext)),
            OrderStatus.cancelled,
            callerScope(authContext)
        )
        .then(async (order) => {
            if (order) {
                /*
                 * The hold is given back after the status write, deliberately: the conditional
                 * move guarantees this runs at most once per order — a second cancel loses the
                 * `$in: ['pending']` match. Belt AND braces, since `releaseForOrder` claims the
                 * reservation's status conditionally too — both guards exist because the two
                 * callers (a customer cancelling, the sweep's deadline) can race, and exactly
                 * one moves the counters. Unchecked here: a hold already expired is an ordinary
                 * sequence, the units are already back.
                 */
                await inventoryService.releaseForOrder(String(order._id));

                // Whoever has to compensate hears it from here; `refund` says whether the money
                // is part of that. The fact is announced either way.
                await emitDomainEvent(ORDER_CANCELLED, { orderId: String(order._id), refund });

                // No context: the reservation-sweep expiry, not a request. Audited as a system
                // actor rather than skipped — see the docblock above — and reported under its own
                // analytics name so a timeout is never counted as a customer's choice to cancel.
                const isSystemExpiry = !context;
                const emitContext = context ?? { caller: {} };

                emitAuditEvent(
                    buildAuditEvent(emitContext, {
                        action: ordersAuditActions.ORDER_CANCELLED,
                        outcome: 'success',
                        target_type: 'order',
                        target_id: String(order._id),
                        ...(isSystemExpiry ? { actor_role: 'admin', actor_user_id: 'system' } : {})
                    })
                );
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(emitContext),
                    event: isSystemExpiry
                        ? ordersAnalyticsEvents.ORDER_RESERVATION_EXPIRED
                        : ordersAnalyticsEvents.ORDER_CANCELLED,
                    properties: { order_id: String(order._id) }
                });

                return generateSuccess(order, 200, t('orders.cancel.success'));
            }

            // Which refusal was it? This read only informs the message — the write above
            // already decided nothing changes.
            return getById(id, callerScope(authContext)).then((existing) =>
                existing
                    ? generateReject(409, [
                          {
                              code: 'ORDER_NOT_CANCELLABLE',
                              message: t('orders.cancel.not-cancellable')
                          }
                      ])
                    : generateReject(404, [t('orders.not-found')])
            );
        });
};

/** The service's public surface — every controller and cross-module caller goes through this. */
export const orderService = {
    search,
    getById,
    callerScope,
    create,
    recordCreated,
    update,
    updateById,
    remove,
    removeById,
    cancelById,
    withActions
};
