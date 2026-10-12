/**
 * @module
 * Reading orders: search, the narrow id and export reads siblings ask for, one order by id, and the
 * two counters and lookups `payments` and checkout lean on. Writes live in `./crud` and `./remove`.
 */

import type { SearchOrdersRequest, Order, CallerContext, AuthContext } from '@types';
import type { OrderDocument } from '../model';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import {
    readAll,
    MAX_CONFIGURED_PAGE_SIZE,
    type PaginatedMeta
} from '@infrastructure/persistence/search';
import { ordersAnalyticsEvents } from '../analytics';
import { decryptOrderAddress } from '../pii';
import { orderRepository } from '../repository';
import { resolveCurrentImages } from './current';
import { callerScope, ownerScope } from './scope';
import { fulfillmentStatusFilter } from '../domain';
import { toObjectId } from '@infrastructure/persistence/create-repository';

/**
 * Turn `fulfillmentStatus` — a value derived on read, not a stored column — into the conditions
 * that make `fulfillmentStatusOf` answer it, and AND them into the scope. The rest of the search
 * goes through unchanged. Not a stored copy of the answer: a filter built from the same table
 * cannot disagree with the value a row serializes with.
 *
 * @param request - the search as it arrived
 * @param scope - the caller's own scope
 * @returns the arguments for `orderRepository.search`
 */
const withFulfillmentFilter = (
    request: SearchOrdersRequest,
    scope: Record<string, unknown> | undefined
): [SearchOrdersRequest, Record<string, unknown> | undefined] => {
    const { fulfillmentStatus, ...rest } = request;
    return fulfillmentStatus
        ? [rest, { $and: [scope ?? {}, fulfillmentStatusFilter(fulfillmentStatus)] }]
        : [rest, scope];
};

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
    orderRepository.search(...withFulfillmentFilter(search, scope)).then((result) =>
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

/** What a board needs to name an order's buyer and when it was paid — nothing more. */
export interface OrderBrief {
    id: string;
    orderNumber: string;
    /** Absent once the account was erased. */
    userId?: string;
    email: string;
    /** When the payment settled; absent for an order never paid. */
    paidAt?: Date;
}

/**
 * The narrow read an admin board makes about a page of orders: who bought and when it was paid, by
 * id, in one query however many orders the page holds. Not a view of the order — no lines, no
 * addresses — so a board never needs the rest of it.
 *
 * @param orderIds - the orders on the page
 * @returns a brief per order found, by id; an id that matches nothing is simply absent
 */
export const orderBriefsByIds = (orderIds: readonly string[]): Promise<Map<string, OrderBrief>> =>
    orderIds.length === 0
        ? Promise.resolve(new Map<string, OrderBrief>())
        : orderRepository
              .findAll(
                  { _id: { $in: orderIds.map((id) => toObjectId(id)) } },
                  { limit: orderIds.length }
              )
              .then(
                  (orders) =>
                      new Map(
                          orders.map((order): [string, OrderBrief] => [
                              String(order._id),
                              {
                                  id: String(order._id),
                                  orderNumber: order.orderNumber,
                                  email: order.email,
                                  ...(order.userId ? { userId: String(order.userId) } : {}),
                                  ...(order.paidAt ? { paidAt: order.paidAt } : {})
                              }
                          ])
                      )
              );

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
 * One order by id, as far as this caller may read it — {@link getById} behind {@link callerScope}.
 * A missing, malformed or someone else's order all answer `undefined`, so a controller turns the
 * three into the same 404.
 * @param id - the order
 * @param authContext - the caller, or `undefined` for no request behind this read
 */
export const getForCaller = (
    id: string | undefined,
    authContext: AuthContext | undefined
): Promise<OrderDocument | undefined> => getById(id, callerScope(authContext));

/**
 * The order's frozen billing address in plaintext, for the invoice issuer: a hydrated
 * {@link OrderDocument} holds the stored ciphertext, and only `toJSON` decrypts.
 * @param order - the order as {@link getById} hands it back
 * @returns the address, or `undefined` on an order that never had one
 */
export const billingAddressOf = (order: OrderDocument): Order['billingAddress'] =>
    order.billingAddress
        ? decryptOrderAddress(order.billingAddress, 'billingAddress', String(order._id))
        : undefined;

/**
 * The ids of the orders this account has open and unpaid right now, whatever the payment method —
 * what checkout's open-order cap counts, and what its refusal points the buyer at. Every one holds
 * stock (15 minutes by card, a week by bank transfer or a `processing` card), so a cap on them is
 * what stops one account taking the shelf.
 *
 * @param userId - the caller
 * @returns the order ids, unordered
 */
export const openUnpaidOrderIds = (userId: string): Promise<string[]> =>
    orderRepository.findOpenUnpaidIdsOf(userId);

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
