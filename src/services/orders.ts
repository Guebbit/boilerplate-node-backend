import { Op } from 'sequelize';
import type { SearchOrdersRequest, OrdersResponse, Order } from '@api/api';
import type { IOrderDocument } from '@models/orders';
import OrderRepository from '@repositories/orders';

/**
 * Order Service
 * Handles all business logic for the Order entity.
 * Delegates raw database access to Order Repository.
 */

/**
 * Get all orders, with computed fields (totalItems, totalQuantity, totalPrice).
 *
 * @param where - Optional additional filter applied to the query
 */
export const getAll = async (where: Record<string, unknown> = {}): Promise<(IOrderDocument & { totalItems: number; totalQuantity: number; totalPrice: number })[]> => {
    const orders = await OrderRepository.findAll({ where });
    const ids = orders.map(o => o.id);
    const totalsMap = await OrderRepository.computeOrderTotals(ids);
    return orders.map(order => {
        const totals = totalsMap.get(order.id) ?? { totalItems: 0, totalQuantity: 0, totalPrice: 0 };
        return Object.assign(order, totals);
    });
};

/**
 * Search orders (DTO-friendly) — matches POST /orders/search in OpenAPI.
 *
 * Filters: id, userId, productId, email
 * Pagination: page (1-based), pageSize
 *
 * @param search
 * @param scope - Additional query filters merged into the where clause
 */
export const search = async (
    search: SearchOrdersRequest = {},
    scope?: Record<string, unknown>,
): Promise<OrdersResponse> => {
    const page = Math.max(1, Number(search.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(search.pageSize ?? 10) || 10));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { ...scope };

    if (search.id && String(search.id).trim() !== '')
        where['id'] = Number(search.id);

    if (search.userId && String(search.userId).trim() !== '')
        where['userId'] = Number(search.userId);

    if (search.email && String(search.email).trim() !== '')
        where['email'] = String(search.email).trim();

    const totalItems = await OrderRepository.count(where);
    const totalPages = Math.ceil(totalItems / pageSize);

    const orders = await OrderRepository.findAll({
        where,
        sort: [['createdAt', 'DESC']],
        skip,
        limit: pageSize,
    });

    const ids = orders.map(o => o.id);
    const totalsMap = await OrderRepository.computeOrderTotals(ids);

    const items = orders.map(order => {
        const totals = totalsMap.get(order.id) ?? { totalItems: 0, totalQuantity: 0, totalPrice: 0 };
        return Object.assign(order, totals);
    });

    /**
     * productId filter — applied post-fetch since it filters on the related
     * order_items table. For production workloads with large datasets, consider
     * adding a subquery or JOIN in the repository layer.
     */
    const filtered = search.productId && String(search.productId).trim() !== ''
        ? items.filter(order =>
            (order.orderItems ?? []).some(item => item.productId === Number(search.productId))
          )
        : items;

    return {
        // IOrderDocument[] returned as Order[] — the API type differs from the DB schema
        // (orderItems vs items, userId number vs string) but the runtime data is compatible
        items: filtered as unknown as Order[],
        meta: {
            page,
            pageSize,
            totalItems: search.productId ? filtered.length : totalItems,
            totalPages: search.productId ? Math.ceil(filtered.length / pageSize) : totalPages,
        },
    };
};


export default { getAll, search };
