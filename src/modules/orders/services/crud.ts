/**
 * @module
 * Reading and writing an order: search, fetch, create, amend, delete. `create` composes around
 * `placeOrder` (`./place`), which owns its own rollback on a refused write — see `./retract`.
 * Cancellation is not here either; it is a sequence with consequences of its own and lives in
 * `./cancel`.
 */

import { getDefaultLocale, t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import { OrderStatus } from '@types';
import type { SearchOrdersRequest, CartItem, UpdateOrderByIdRequest, Order } from '@types';
import type { OrderDocument } from '../model';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { productService } from '@modules/products';
import { inventoryService } from '@modules/inventory';
import { userService } from '@modules/users';
import { emitDomainEvent } from '@kernel/events';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { ordersAnalyticsEvents } from '../analytics';
import { ordersAuditActions } from '../audit';
import { ORDER_STATUS_CHANGED } from '../events';
import { orderRepository } from '../repository';
import { canTransition, statusesLeadingTo, statusesReachableFrom } from '../domain';
import { resolveCurrentImages } from './current';
import { freezeOrderLines } from './snapshot';
import { placeOrder } from './place';
import { deleteCachedInvoice } from './invoice';
import { sendOrderPlacedEmail, mailBuyer } from './notify';
// `userId` is stored as an ObjectId, so writes have to coerce it. The rule (and its failure
// mode on a malformed id) lives in the repository layer; this is the only import of it here.
import { toObjectId } from '@infrastructure/persistence/create-repository';
import {
    readAll,
    MAX_CONFIGURED_PAGE_SIZE,
    type PaginatedMeta
} from '@infrastructure/persistence/search';
import { ownerScope } from './scope';

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
    items: Order[];
    meta: PaginatedMeta;
}> =>
    orderRepository.search(search, scope).then((result) =>
        // One batched `$in` for the whole page, however many orders it holds — see `./current`.
        resolveCurrentImages(result.items).then((items) => {
            if (context)
                emitAnalyticsEvent({
                    ...buildAnalyticsBase(context),
                    event: ordersAnalyticsEvents.ORDERS_VIEWED
                });
            return { items, meta: result.meta };
        })
    );

/**
 * Every order id belonging to `userId` — the narrow read a sibling module needing only ids (not
 * full order documents, and none of `search`'s image resolution or analytics emit) asks for,
 * paged internally with `readAll` so an account with more orders than one page still gets every
 * id. `.search()`'s items are the wire shape (`Order`, carrying `id`), not `OrderDocument`.
 * @param userId - the account whose own orders these are
 */
export const ownOrderIds = (userId: string): Promise<string[]> =>
    readAll(
        (page) =>
            orderRepository
                .search({ page, pageSize: MAX_CONFIGURED_PAGE_SIZE }, ownerScope(userId))
                .then((result) => result.items),
        MAX_CONFIGURED_PAGE_SIZE
    ).then((orders) => orders.map((order) => order.id));

/**
 * Every order this account placed, in wire shape — for the account's own data export. Goes
 * through {@link search} (not `orderRepository.search` directly, unlike {@link ownOrderIds}), so
 * each order's current-image resolution runs the same way a listing's would. No `context`, so the
 * `orders_viewed` analytics emit stays off — an export is not a view.
 *
 * @param userId - the caller's own id
 */
export const findOwnOrders = (userId: string): Promise<Order[]> =>
    readAll(
        (page) =>
            search({ page, pageSize: MAX_CONFIGURED_PAGE_SIZE }, ownerScope(userId)).then(
                (result) => result.items
            ),
        MAX_CONFIGURED_PAGE_SIZE
    );

/**
 * Get a single order by ID, restricted to a caller's own rows when `scope` narrows it — always
 * the hydrated `OrderDocument`, whether or not `scope` is passed. Returns undefined if `id` is
 * falsy or if not found.
 * @param scope - optional extra filter (e.g. restrict to a specific userId)
 */
export const getById = (
    id: string | undefined,
    scope?: Record<string, unknown>
): Promise<OrderDocument | undefined> => {
    if (!id) return Promise.resolve(undefined);
    return orderRepository.findByIdScoped(id, scope);
};

/**
 * Report that an order was created — from the admin route or a customer's checkout
 * (`@modules/cart`'s `orderConfirm`), split out since the two paths' writes share only this
 * fact. The audit records the buyer's real role, whatever it is: no forced override — an admin
 * placing their own order is audited as `admin`, same as any other action they take.
 *
 * Audit and analytics ONLY — `ORDER_CREATED` itself is `placeOrder`'s own job (`./place.ts`), the
 * one function that actually writes a new order, so a future caller of THIS function forgetting
 * to call it can no longer also mean `webhooks` never hears about the order at all.
 */
export const recordCreated = (order: OrderDocument, context: CallerContext): void => {
    recordAudit(context, {
        action: ordersAuditActions.ORDER_CREATED,
        outcome: 'success',
        target_type: 'order',
        target_id: String(order._id)
    });
    emitAnalyticsEvent({
        ...buildAnalyticsBase(context),
        event: ordersAnalyticsEvents.ORDER_CREATED,
        properties: { order_id: String(order._id) }
    });
};

/**
 * How many `bank_transfer` orders this account has open right now — the cap checkout enforces
 * before letting a caller take a free week-long hold on more stock than they can be trusted with.
 *
 * @param userId - the caller
 */
export const countOpenBankTransfers = (userId: string): Promise<number> =>
    orderRepository.countOpenBankTransfers(userId);

/**
 * The order a `bank_transfer` checkout stamped with this RF reference — `payments`' admin lookup,
 * which reads it back off a bank statement. Exact match only: normalizing what an admin pasted is
 * `orders/domain/transfer-reference.ts`'s job, before it gets here.
 *
 * @param reference - an already-normalized RF reference
 * @returns the order, or `null` when no order carries it
 */
export const getByTransferReference = (reference: string): Promise<OrderDocument | null> =>
    orderRepository.findOne({ transferReference: reference });

/**
 * Looks up each line's product by id — the read `create` and `rewriteItems` both need before they
 * can freeze a snapshot, kept in one place so the two writers can't drift on how a line's product
 * is resolved.
 * @param items - `{ productId, quantity }` pairs
 * @returns each item paired with its product, or `null` when the id no longer resolves
 */
const resolveItemProducts = (
    items: CartItem[]
): Promise<{ item: CartItem; product: Awaited<ReturnType<typeof productService.findByIdRaw>> }[]> =>
    Promise.all(
        items.map((item) =>
            productService.findByIdRaw(item.productId).then((product) => ({ item, product }))
        )
    );

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
    // The snapshot each line freezes wants the BUYER's stored language, never the caller's: this
    // endpoint lets an admin place an order for someone else, and `context.locale` there is the
    // admin's own UI language, not the recipient's. Same rule as `@modules/cart`'s checkout.
    //
    // Guarded: a lookup failure here must fall back to the default locale, not abort the order
    // this endpoint is about to place. `mailBuyer`, further down, covers the same failure for the
    // placed-order email with its own independent lookup — the two normally agree, since both
    // read the same account, but neither may block on the other.
    const buyerLocale = await userService
        .getById(userId)
        .then((buyer) => buyer?.locale ?? getDefaultLocale())
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: 'Buyer lookup failed while pricing a new order; using the default locale.',
                userId,
                error
            });
            // Stryker restore all
            return getDefaultLocale();
        });

    // `Promise.all([])` settles without a query, so an empty basket still costs no round trip.
    const resolvedItems = await resolveItemProducts(items);

    // The admin path sells the same shelf the storefront does — the same write, freeze, invoice
    // allocation and stock hold `placeOrder` runs for `@modules/cart`'s checkout, with no
    // payment method or shipping: this endpoint offers neither.
    const outcome = await placeOrder({
        userId,
        email,
        locale: buyerLocale,
        lines: resolvedItems
    });
    if (!outcome.ok) {
        if (outcome.reason === 'no-lines')
            return generateReject(422, [t('generic.error-missing-data')]);
        if (outcome.reason === 'product-missing')
            return generateReject(404, [t('products.not-found')]);
        return generateReject(409, [
            {
                code: 'ORDER_INSUFFICIENT_STOCK',
                message: t('orders.insufficient-stock'),
                // Which line blocked it, and what is actually on the shelf.
                details: { lines: outcome.shortfalls }
            }
        ]);
    }
    const { order } = outcome;

    recordCreated(order, context);

    // `recordCreated` is shared with `@modules/cart`'s checkout, which sends its own placed-order
    // email, so mailing here too would double-send if this weren't split per caller. `mailBuyer`
    // re-resolves the buyer for the mail's own locale/name — see this function's own guarded
    // lookup above for why a second, independent attempt is worth the extra read.
    void mailBuyer(order, (locale, name) => sendOrderPlacedEmail(order, locale, name, email));

    return generateSuccess(order, 201, t('orders.creation-success'));
};

/**
 * Whether an admin's requested status move is refused before anything is written — either the
 * table doesn't allow this move at all, or it does but this endpoint is the wrong door for it
 * (cancellation has its own release/refund sequence, so `POST /orders/{id}/cancel` is where it
 * runs instead). The controller's Zod schema already validated the VALUE against the generated
 * enum; what is decided here is whether the MOVE exists. See `docs/theory/tactical-ddd.md` §1.
 * @param previousStatus - the order's current status
 * @param nextStatus - the requested status, or `undefined` when this update doesn't touch status
 * @returns the rejection to return, or `undefined` when the move (or lack of one) is fine
 */
const transitionRefused = (
    previousStatus: OrderStatus,
    nextStatus: OrderStatus | undefined
): ResponseReject | undefined => {
    if (nextStatus === undefined) return undefined;

    if (!canTransition(previousStatus, nextStatus, 'admin'))
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

    if (nextStatus === OrderStatus.cancelled)
        return generateReject(409, [
            {
                code: 'ORDER_CANCEL_VIA_CANCEL_ENDPOINT',
                message: t('orders.transition.cancel-elsewhere'),
                details: { from: previousStatus, to: nextStatus }
            }
        ]);

    return undefined;
};

/**
 * Rewrites an order's line items in place — refused outright while the shelf is still holding this
 * order's reservation (the reservation froze its own copy of the basket, and a later
 * `commitForOrder` would decrement products the order no longer contains; `inventory` owns the
 * question), otherwise re-resolves and re-freezes the replacement lines onto `order.items`.
 * @param order - the order being edited; `order.items` is mutated in place on success
 * @param requestedItems - the caller's replacement `{ productId, quantity }` lines
 * @returns a rejection if refused, `undefined` once `order.items` has been rewritten
 */
const rewriteItems = (
    order: OrderDocument,
    requestedItems: CartItem[]
): Promise<ResponseReject | undefined> =>
    inventoryService.isStockBoundToOrder(String(order._id)).then((bound) => {
        if (bound)
            return generateReject(409, [
                {
                    code: 'ORDER_ITEMS_HELD',
                    message: t('orders.items-held')
                }
            ]);

        return resolveItemProducts(requestedItems).then((resolvedItems) => {
            const missingProduct = resolvedItems.some(({ product }) => !product);
            if (missingProduct) return generateReject(404, [t('products.not-found')]);

            /*
             * No fresh buyer context on an admin PATCH — `update()` takes no `CallerContext`.
             * Reuse whatever language the order's own lines are already frozen in, so an admin
             * editing line items doesn't silently switch the order to a different language
             * mid-flight.
             */
            const lineLocale = order.items[0]?.locale ?? getDefaultLocale();
            return freezeOrderLines(
                lineLocale,
                resolvedItems.map(({ product }) => product!),
                resolvedItems.map(({ item }) => item.quantity)
            ).then((lines) => {
                order.items = lines;
                return undefined;
            });
        });
    });

/**
 * Applies an admin's already-validated status move: a conditional write, not the blind
 * `order.status = next; save()` this replaces — a customer cancel landing between the read at the
 * top of `update` and this write must not be silently overwritten by a stale `next`.
 * `statusesLeadingTo` is the same "from" set `markSystemMove` (`./status.ts`) uses for a system
 * report, applied here to an admin's request instead. Announces `ORDER_STATUS_CHANGED` only after
 * the write lands: a status is only "changed" once it is on disk, and the listeners (the shipment,
 * one day a notification) compensate for facts, not plans.
 * @param saved - the order as just read back from `orderRepository.save`
 * @param previousStatus - the status this update originally read the order at
 * @param nextStatus - the status being moved to
 */
const applyStatusMove = (
    saved: OrderDocument,
    previousStatus: OrderStatus,
    nextStatus: OrderStatus
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> =>
    orderRepository
        .updateStatusIfIn(String(saved._id), statusesLeadingTo(nextStatus, 'admin'), nextStatus)
        .then((moved) => {
            if (!moved)
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

            return emitDomainEvent(ORDER_STATUS_CHANGED, {
                orderId: String(moved._id),
                from: previousStatus,
                to: nextStatus
            }).then(() => generateSuccess(moved));
        });

/**
 * Update an existing order document (admin), only the fields provided. The only pure-status move
 * reachable here is to `processing`; `shipped`/`delivered` are `delivery`'s own doors and
 * cancellation lives in `cancelById` — `transitionRefused` refuses both below.
 */
// `async` for the same reason the repositories are: `toObjectId(data.userId)` below throws on a
// malformed id, and a function typed `Promise<T>` must reject rather than throw synchronously.
export const update = async (
    order: OrderDocument,
    data: UpdateOrderByIdRequest
): Promise<ResponseSuccess<OrderDocument> | ResponseReject> => {
    const previousStatus = order.status;
    const nextStatus = data.status;

    // Asked before anything is assigned, so a refusal is never a partial write.
    const refusal = transitionRefused(previousStatus, nextStatus);
    if (refusal) return refusal;

    // `order.status` is deliberately NOT assigned here — see below, where the status
    // half of this write goes through a conditional `findOneAndUpdate` instead of riding along
    // on this document's blind `save()`.
    if (data.email !== undefined) order.email = data.email;
    if (data.userId !== undefined) order.userId = toObjectId(data.userId);

    const requestedItems = data.items;
    const itemsRewritten = Boolean(requestedItems && requestedItems.length > 0);
    const updateItemsPromise =
        requestedItems && requestedItems.length > 0
            ? rewriteItems(order, requestedItems)
            : Promise.resolve();

    return updateItemsPromise.then((earlyResult) => {
        if (earlyResult) return earlyResult;
        return orderRepository.save(order).then((saved) => {
            // The cached PDF (if one exists) now describes lines that no longer exist. Deleted,
            // not re-rendered here: the next `GET /orders/{id}/invoice` renders fresh and refills
            // the cache — nothing on this write path needs the bytes.
            if (itemsRewritten) void deleteCachedInvoice(String(saved._id));

            if (nextStatus === undefined || nextStatus === previousStatus)
                return generateSuccess(saved);

            return applyStatusMove(saved, previousStatus, nextStatus);
        });
    });
};

/**
 * Update an existing order by ID (admin).
 * Fetches the document then delegates to update().
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
                recordAudit(context, {
                    action: ordersAuditActions.ORDER_UPDATED,
                    outcome: 'success',
                    target_type: 'order',
                    target_id: id
                });
            return result;
        });
    });

/**
 * Remove an order document (soft or hard delete). Soft stamps `deletedAt` once — an order is a
 * financial record, so hiding it isn't destroying it; `restoreById` undoes it. Hard gives
 * the units back first: an order holds stock, and destroying the row without releasing it
 * leaves the shelf holding units for nothing, until the TTL sweep records the deletion as an
 * expiry.
 * @param hardDelete - `true` destroys the row; `false` stamps `deletedAt` once
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
                // Best-effort, after the row is gone: a cached invoice outlives the document it
                // was rendered for otherwise — nothing else deletes one.
                .then(() => deleteCachedInvoice(String(order._id)))
                .then(() => generateSuccess(undefined, 200, t('orders.hard-deleted')))
        );

    // SOFT delete — the default path for an order, which is a financial record. Already
    // deleted: nothing to do. DELETE must be safe to retry; undoing it is `restoreById`.
    if (order.deletedAt)
        return Promise.resolve(generateSuccess(order, 200, t('orders.soft-deleted')));

    order.deletedAt = new Date();
    return orderRepository
        .save(order)
        .then((saved) => generateSuccess(saved, 200, t('orders.soft-deleted')));
};

/**
 * Undo a soft delete.
 *
 * @param id - the order to restore
 * @returns the restored order; 404 when there is none, 409 when it is not soft-deleted
 */
export const restoreById = (id: string): Promise<ResponseSuccess<OrderDocument> | ResponseReject> =>
    orderRepository.findById(id).then((order) => {
        if (!order) return generateReject(404, [t('orders.not-found')]);
        if (!order.deletedAt) return generateReject(409, [t('orders.not-deleted')]);
        order.deletedAt = undefined;
        return orderRepository
            .save(order)
            .then((saved) => generateSuccess(saved, 200, t('orders.restored')));
    });

/**
 * Remove an order by ID (soft or hard delete).
 * Fetches the document then delegates to remove().
 *
 * @param hardDelete - `true` destroys the row; `false` stamps `deletedAt` once
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
