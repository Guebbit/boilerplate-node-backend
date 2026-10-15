/**
 * @module
 * The reads behind the admin's preorder board (ADMIN_SALES 3): the fulfillment orders of preorders
 * with their buyer and payment, and the per-product unit counts. `delivery` owns the dates, the
 * consent state and the hold, so it is the one that can answer; the buyer and `paidAt` come from
 * `orders`, one batched read a page.
 *
 * Who may read: the audience of the orders themselves. The route asks `orders.self.read`, which every
 * signed-in account holds, so the scope is in the query: staff holding `orders.any.read` see every
 * row, anyone else only their own orders'.
 *
 * See: docs/modules/delivery.md#the-preorder-board
 */

import { callerForSubject } from '@kernel/permissions';
import { heldKeys } from '@kernel/ability';
import { orderBriefsByIds, ownOrderIds } from '@modules/orders';
import {
    buildPaginatedMeta,
    normalizePagination,
    type PaginatedMeta,
    type PaginationInput
} from '@infrastructure/persistence/search';
import type {
    AuthContext,
    PreorderFulfillmentOrder,
    PreorderFulfillmentState,
    PreorderProductSummary
} from '@types';
import { FulfillmentOrderStatus } from '@types';
import { fulfillmentOrderRepository, shipmentRepository } from '../repository';
import type { BoardFilters } from '../repository';
import type { FulfillmentOrderDocument } from '../model';
import { presentPreorderFulfillmentOrder, presentProductSummary } from '../presenter';

/** What the list route accepts, beyond the page. */
export interface BoardQuery extends PaginationInput {
    preorder?: boolean | undefined;
    state?: PreorderFulfillmentState | undefined;
    productId?: string | undefined;
    late?: boolean | undefined;
    dueWithin?: number | undefined;
}

/**
 * The orders the caller may read, or `undefined` for all of them. Staff holding `orders.any.read`
 * read every order; anyone else reads their own, and a caller with no id reads none.
 *
 * @param authContext - the caller
 */
const readableOrders = (
    authContext: AuthContext | undefined
): Promise<readonly string[] | undefined> => {
    if (!authContext) return Promise.resolve([]);
    const readsEvery = heldKeys(callerForSubject(authContext, 'Order')).has('orders.any.read');
    return readsEvery ? Promise.resolve(undefined) : ownOrderIds(authContext.id);
};

/**
 * Whether every shipment cut from a closed fulfillment order has arrived.
 *
 * @param fulfillmentOrder - the fulfillment order
 * @param shipped - its shipments
 */
const isDelivered = (
    fulfillmentOrder: FulfillmentOrderDocument,
    shipped: readonly { status: string }[]
): boolean =>
    fulfillmentOrder.status === FulfillmentOrderStatus.closed &&
    shipped.length > 0 &&
    shipped.every(({ status }) => status === 'delivered');

/**
 * A page of the preorder board's fulfillment orders, the earliest expected first.
 *
 * @param query - the filters and the page
 * @param authContext - the caller, whose scope narrows the rows
 * @param now - the instant `late` and `dueWithin` are measured at; tests pass their own
 */
export const listPreorderFulfillmentOrders = async (
    query: BoardQuery,
    authContext: AuthContext | undefined,
    now: Date = new Date()
): Promise<{ items: PreorderFulfillmentOrder[]; meta: PaginatedMeta }> => {
    const pagination = normalizePagination(query);
    const { page: _page, pageSize: _pageSize, ...asked } = query;
    const orderIds = await readableOrders(authContext);
    const filters: BoardFilters = { ...asked, ...(orderIds ? { orderIds } : {}) };

    const { items, totalItems } = await fulfillmentOrderRepository.searchBoard(filters, now, {
        skip: pagination.skip,
        limit: pagination.pageSize
    });
    const [briefs, shipments] = await Promise.all([
        orderBriefsByIds([...new Set(items.map(({ orderId }) => String(orderId)))]),
        shipmentRepository.findByFulfillmentOrderIds(items.map(({ _id }) => String(_id)))
    ]);

    return {
        items: items.map((one) =>
            presentPreorderFulfillmentOrder(
                one,
                briefs.get(String(one.orderId)),
                isDelivered(
                    one,
                    shipments.filter(
                        ({ fulfillmentOrderId }) => String(fulfillmentOrderId) === String(one._id)
                    )
                ),
                now
            )
        ),
        meta: buildPaginatedMeta(pagination, totalItems)
    };
};

/**
 * A page of per-product preorder unit counts, the earliest promise first.
 *
 * @param query - an optional product and the page
 * @param authContext - the caller, whose scope narrows the units counted
 * @param now - the instant `late` is measured at; tests pass their own
 */
export const summarizePreorders = async (
    query: Pick<BoardQuery, 'productId' | 'page' | 'pageSize'>,
    authContext: AuthContext | undefined,
    now: Date = new Date()
): Promise<{ items: PreorderProductSummary[]; meta: PaginatedMeta }> => {
    const pagination = normalizePagination(query);
    const orderIds = await readableOrders(authContext);

    const { items, totalItems } = await fulfillmentOrderRepository.summarizeProducts(
        { productId: query.productId, ...(orderIds ? { orderIds } : {}) },
        now,
        { skip: pagination.skip, limit: pagination.pageSize }
    );

    return {
        items: items.map((row) => presentProductSummary(row)),
        meta: buildPaginatedMeta(pagination, totalItems)
    };
};
