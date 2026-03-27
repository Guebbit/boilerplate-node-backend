import type { SearchOrdersRequest, OrdersResponse, Order } from '@api/api';
import type { IOrder } from '@models/orders';
import type OrderModel from '@models/orders';
import OrderRepository from '@repositories/orders';

/**
 * Order Service
 * Handles all business logic for the Order entity.
 * Delegates raw database access to Order Repository.
 */

/**
 * Transform a Sequelize OrderModel with orderItems into the API-compatible
 * shape the views and controllers expect:
 *   order.id, order.email, order.products[], order.totalItems, order.totalQuantity, order.totalPrice
 */
const toOrderResponse = (order: OrderModel): Record<string, unknown> => {
    const items = order.orderItems ?? [];
    const products = items.map((item) => ({
        quantity: item.quantity,
        product: {
            id: item.productId,
            title: item.title,
            price: item.price,
            description: item.description,
            imageUrl: item.imageUrl,
        },
    }));
    const totalItems = items.length;
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    return {
        ...order.toJSON(),
        products,
        totalItems,
        totalQuantity,
        totalPrice,
    };
};

/**
 * Get all orders, each with computed fields.
 * Accepts optional where filter (scoping by userId etc.).
 *
 * @param where
 */
export const getAll = async (where: Partial<IOrder> = {}): Promise<Record<string, unknown>[]> => {
    const orders = await OrderRepository.findAll(where);
    return orders.map((order) => toOrderResponse(order));
};

/**
 * Search orders (DTO-friendly) — matches POST /orders/search in OpenAPI.
 *
 * @param search
 * @param scope - Additional filters merged into the where clause
 */
export const search = async (
    search: SearchOrdersRequest = {},
    scope: Partial<IOrder> = {},
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

    // Count total matching orders
    const allOrders = await OrderRepository.findAll(where);
    const totalItems = allOrders.length;
    const totalPages = Math.ceil(totalItems / pageSize);

    // Paginate
    const paginatedOrders = allOrders.slice(skip, skip + pageSize);
    const items = paginatedOrders.map((order) => toOrderResponse(order));

    // Filter by productId in memory if provided (orderItems are already loaded)
    let filteredItems = items;
    if (search.productId && String(search.productId).trim() !== '') {
        const pid = Number(search.productId);
        filteredItems = items.filter((order) => {
            const products = order['products'] as Array<{ product: { id: number } }>;
            return products.some((p) => p.product.id === pid);
        });
    }

    return {
        items: filteredItems as unknown as Order[],
        meta: {
            page,
            pageSize,
            totalItems,
            totalPages,
        },
    };
};


export default { getAll, search };
