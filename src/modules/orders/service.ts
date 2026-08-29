import { getDefaultLocale, t } from '@infrastructure/i18n';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
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
import { toObjectId } from '@infrastructure/persistence/base-repository';
import type { PaginatedMeta } from '@infrastructure/persistence/search';
import { withDocument, toggleSoftDelete } from '@infrastructure/persistence/crud-service';

/**
 * Order Service
 * Handles all business logic for the Order entity.
 * Delegates raw database access to Order Repository.
 */

/**
 * Search orders (DTO-friendly) — matches POST /orders/search in OpenAPI.
 *
 * Filters: id, userId, productId, email
 * Pagination: page (1-based), pageSize
 *
 * Note on productId: product data is embedded rather than referenced, so the filter is on
 * `items.product._id` — declared once, in the repository's `searchable.objectIds`.
 *
 * @param search
 * @param scope - Additional query filters merged into the $match stage
 * @param context - caller context for the `orders_viewed` analytics emit; omitted by callers that
 *   are not a request answering `GET /orders` (tests, and any future internal reuse of this as a
 *   plain query helper) — no context means no emit, rather than a synthetic one.
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
 * Report that an order was created — from wherever it was: the admin route (this module's own
 * `create`) or a customer's checkout (`@modules/cart`'s `orderConfirm`).
 *
 * Split out rather than folded into `create()`, because the two paths' writes cannot share more
 * than this: checkout resolves stock and its own rejection codes differently, holds a race-safe
 * cart-clear, and sends its own confirmation mail — the fact that an order now exists is the one
 * thing both are reporting. `actorRole` defaults to the caller's own role, but checkout overrides
 * it to `'user'` unconditionally — a purchase is a customer action regardless of whether the
 * account making it happens to be an admin's.
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
 * Create a new order from a list of { productId, quantity } items.
 * Looks up each product and stores a full snapshot in the order document.
 *
 * @param userId
 * @param email
 * @param items - Array of { productId, quantity }
 * @param context - caller context for the `order_created` analytics/audit emit
 */
export const create = (
    userId: string,
    email: string,
    items: CartItem[],
    context: CallerContext
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> => {
    // One rule call, two outcomes. `Promise.all([])` settles without a query, so an empty basket
    // still costs no round trip. The rule is in `domain/rules.ts`; mapping it to a status code
    // and translated copy is this layer's job.
    return Promise.all(
        items.map((item) =>
            productRepository.findByIdRaw(item.productId).then((product) => ({ item, product }))
        )
    ).then(async (resolvedItems) => {
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
         * Write the order, then hold its units — the same order of operations the storefront
         * checkout uses, and forced by the same thing: a hold is keyed by the order it belongs
         * to, so the order has to exist first.
         *
         * The admin path sells the same shelf the storefront does. Skipping the hold here is how
         * a manually entered order oversells everything the checkout was carefully guarding, so
         * this goes through exactly the same `reserveForOrder` — one conditional write per line,
         * all-or-nothing, rolled back by `inventory` if any line cannot be covered.
         */
        return orderRepository
            .create({
                userId: toObjectId(userId),
                email,
                items: orderItems
            })
            .then(async (order) => {
                const outcome = await inventoryService.reserveForOrder(
                    String(order._id),
                    resolvedItems.map(({ item }) => ({
                        productId: item.productId,
                        quantity: item.quantity
                    }))
                );
                if (!outcome.held) {
                    // Nothing is held, so the only thing to retract is the order.
                    await orderRepository.deleteOne(order);
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
                 * `@modules/cart`'s checkout, which sends its own, so putting it there would mail
                 * every storefront order twice.
                 *
                 * `context.locale` is the whole language chain here, unlike every other mail in
                 * this codebase, and the reason is that an admin-created order has no recipient
                 * record: only an address was supplied, so there is no stored preference to
                 * prefer over the request's. That is also why this used to sit in the controller
                 * — the request was the only source of a language, and until `CallerContext`
                 * carried one there was no way to reach it from here.
                 */
                const mail = orderConfirmEmail(context.locale ?? getDefaultLocale(), email, order);
                void enqueueEmail({ to: email, subject: mail.subject }, mail.template, mail.data);

                return generateSuccess(order, 201, t('orders.creation-success'));
            });
    });
};

/**
 * Update an existing order document (admin).
 * Only updates the fields provided.
 *
 * Writes the moves that are pure status — `processing`, `shipped`, `delivered`. A cancellation is
 * not one of them and lives in `cancelById`.
 *
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
    withDocument(orderRepository.findById(id), 'orders.not-found', (order) =>
        update(order, data).then((result) => {
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
        })
    );

/**
 * Remove an order document (soft or hard delete).
 * Soft delete toggles `deletedAt` (acts as a restore if already soft-deleted).
 *
 * The soft path is what an order actually wants most of the time: it is a financial record, and
 * unsetting it from a customer's view is not the same as destroying it. The hard path gives the
 * units back first — an order holds stock, so destroying the row without releasing it leaves the
 * shelf holding units for an order nobody can look up, until the TTL sweep notices and records
 * the deliberate deletion as an expiry.
 *
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
    return toggleSoftDelete(order, orderRepository.save, 'orders.soft-deleted');
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
    withDocument(orderRepository.findById(id), 'orders.not-found', (order) =>
        remove(order, hardDelete)
    );

/**
 * Which orders a caller is allowed to read.
 *
 * The authorization boundary for order reads: the difference between a user seeing their own
 * orders and seeing everyone's, and between seeing a soft-deleted order and not. `visibleScope`
 * is what makes it BOTH — `ownerScope` alone would answer "whose" and leave soft-deleted rows
 * visible to their owner.
 *
 * Returns `undefined` for admins, meaning "no restriction", so callers must spread it
 * (`{ ...callerScope(ctx), status: 'paid' }`) rather than treat it as a filter. Why the scope
 * rides in the read, and why a caller with no id throws rather than widening, are the shared
 * rule's to explain — see `createOwnerScope`.
 */
export const callerScope = createOwnerScope(orderRepository.visibleScope);

/**
 * Which column of the lifecycle table a caller reads.
 *
 * Two actors reach the HTTP surface. `system` is not one of them: it names the moves that follow a
 * fact from outside the application, and no request may claim it.
 *
 * @param authContext - the caller
 * @returns the actor whose permissions apply
 */
const actorOf = (authContext?: Caller): OrderActor => (authContext?.admin ? 'admin' : 'customer');

/**
 * The single-order response body: the order as it serializes, plus what this caller may do to it.
 *
 * The serialization is explicit because the two read branches return different things — the admin
 * branch a Mongoose document, the scoped branch an already-normalized plain object. `actions` has
 * to ride on the wire shape; set on a document it would be dropped by the schema's transform.
 *
 * @param order - the order, from either read branch
 * @param authContext - the caller whose options are being described
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
 * Cancel an order — the one write a customer may make to one, or the system makes when a
 * reservation times out unpaid.
 *
 * A conditional status move, not a read-check-write: the repository's filter carries the
 * caller's scope AND the `pending` requirement, so a cancel racing the admin's "shipped" (or a
 * double-clicked cancel) resolves at the storage layer — exactly one write matches. The
 * follow-up read on the `null` branch exists only to tell 404 from 409 in the answer; by then
 * the decision is already made.
 *
 * @param id - the order to cancel
 * @param authContext - whose view of the collection the write happens in ({@link callerScope})
 * @param context - caller context for the audit/analytics emit. Optional: the reservation-sweep
 *   expiry (`module.ts`'s `RESERVATION_EXPIRED` handler) calls this with no context at all — a
 *   lease timing out is not a request, so there is nothing to attribute it to. The audit entry
 *   still fires (tagged `actor_role: 'admin'`, `actor_user_id: 'system'` — the order's state still
 *   changed and the trail must say so), and analytics reports `order_reservation_expired` rather
 *   than `order_cancelled`: the same status move, a different reason for it.
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
                 * The hold is given back. After the status write, deliberately: the conditional
                 * move is what guarantees this runs at most once per order — a second cancel
                 * loses the `$in: ['pending']` match and never reaches here.
                 *
                 * That is now belt AND braces, because `releaseForOrder` claims the
                 * reservation's own status conditionally too. Either guard alone would be
                 * enough; both exist because the two callers are different — this one is a
                 * customer cancelling, the sweep is a deadline passing, and they can happen at
                 * the same moment. Exactly one of them moves the counters.
                 *
                 * Whether it released is not checked. An order cancelled after its hold already
                 * expired is a perfectly ordinary sequence, and there is nothing left to do
                 * about it: the units are already back.
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
