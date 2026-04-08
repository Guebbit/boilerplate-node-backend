/* eslint-disable unicorn/no-null */
import { Op } from 'sequelize';
import { orderModel, type IOrderDocument, type IOrderProduct } from '@models/orders';
import { orderItemModel } from '@models/order-items';

/**
 * Hydrates one.
 *
 * @param order - Parameter used by this operation.
 */
const hydrateOne = (order: { id: number } & Record<string, unknown>) =>
    orderItemModel.findAll({ where: { orderId: order.id }, raw: true }).then((items) => {
        const products: IOrderProduct[] = items.map((item) => ({
            product: {
                id: item.productId == null ? undefined : String(item.productId),
                title: item.productTitle,
                price: item.productPrice,
                description: item.productDescription,
                imageUrl: item.productImageUrl,
                active: item.productActive
            },
            quantity: item.quantity
        }));

        return {
            ...order,
            products
        } as IOrderDocument;
    });

/**
 * Hydrates all.
 *
 * @param orders - Parameter used by this operation.
 */
const hydrateAll = (orders: Array<{ id: number } & Record<string, unknown>>) =>
    Promise.all(orders.map((order) => hydrateOne(order)));

/**
 * Applies match.
 *
 * @param rows - Database rows processed by the operation.
 * @param match - Match criteria applied to records.
 */
const applyMatch = (rows: IOrderDocument[], match: Record<string, unknown>) => {
    const keys = Object.keys(match);
    return rows.filter((row) =>
        keys.every((key) => {
            if (key === 'id') return Number(row.id) === Number(match[key]);
            if (key === 'userId') return Number(row.userId) === Number(match[key]);
            if (key === 'email') return String(row.email) === String(match[key]);
            if (key === 'products.product.id')
                return row.products.some(
                    (product) =>
                        product.product.id != null &&
                        Number(product.product.id) === Number(match[key])
                );
            return true;
        })
    );
};

/**
 * Extracts product id.
 *
 * @param product - Product entity used by the operation.
 */
const extractProductId = (product: IOrderProduct['product']): number => Number(product.id ?? 0);

/**
 * Adds computed fields.
 *
 * @param rows - Database rows processed by the operation.
 */
const addComputedFields = (rows: IOrderDocument[]) =>
    rows.map((row) => ({
        ...row,
        totalItems: row.products.length,
        totalQuantity: row.products.reduce((sum, item) => sum + item.quantity, 0),
        totalPrice: row.products.reduce(
            (sum, item) =>
                sum + Number((item.product as { price?: number }).price ?? 0) * item.quantity,
            0
        )
    }));

/**
 * Runs aggregate.
 *
 * @param pipeline - Aggregate pipeline stages to execute.
 */
export const aggregate = async <T = IOrderDocument>(
    pipeline: Array<Record<string, unknown>>
): Promise<T[]> => {
    const persistedOrders = await orderModel.findAll({
        order: [['createdAt', 'DESC']]
    });
    let rows = await hydrateAll(
        persistedOrders.map(
            (order) => order.get({ plain: true }) as { id: number } & Record<string, unknown>
        )
    );

    for (const stage of pipeline) {
        if ('match' in stage) rows = applyMatch(rows, stage.match as Record<string, unknown>);
        if ('sort' in stage) {
            const [field, direction] = Object.entries(stage.sort as Record<string, unknown>)[0] ?? [
                'createdAt',
                -1
            ];
            // eslint-disable-next-line unicorn/no-array-sort
            rows = [...rows].sort((a, b) => {
                const av = a[field as keyof IOrderDocument] as number | string | Date;
                const bv = b[field as keyof IOrderDocument] as number | string | Date;
                const factor = Number(direction) === -1 ? -1 : 1;
                if (av === bv) return 0;
                return av > bv ? factor : -factor;
            });
        }
        if ('addFields' in stage) rows = addComputedFields(rows) as IOrderDocument[];
        if ('skip' in stage) rows = rows.slice(Number(stage.skip));
        if ('limit' in stage) rows = rows.slice(0, Number(stage.limit));
        if ('count' in stage) return [{ [String(stage.count)]: rows.length } as T];
    }

    return rows as T[];
};

/**
 * Finds by id.
 *
 * @param id - Resource identifier.
 */
export const findById = (id: string | number) =>
    orderModel.findByPk(Number(id)).then((order) => {
        if (!order) return null;
        return hydrateOne(order.get({ plain: true }) as { id: number } & Record<string, unknown>);
    });

/**
 * Creates a record.
 *
 * @param data - Payload containing values to create or update.
 */
export const create = (data: Partial<IOrderDocument>): Promise<IOrderDocument> =>
    orderModel
        .create({
            userId: Number(data.userId),
            email: String(data.email ?? ''),
            status: data.status,
            notes: data.notes
        } as never)
        .then((order) => {
            const products = (data.products ?? []) as IOrderProduct[];
            return Promise.all(
                products.map((entry) =>
                    orderItemModel.create({
                        orderId: order.id,
                        productId: extractProductId(entry.product),
                        quantity: Number(entry.quantity),
                        productTitle: String((entry.product as { title?: string }).title ?? ''),
                        productPrice: Number((entry.product as { price?: number }).price ?? 0),
                        productDescription: String(
                            (entry.product as { description?: string }).description ?? ''
                        ),
                        productImageUrl: String(
                            (entry.product as { imageUrl?: string }).imageUrl ?? ''
                        ),
                        productActive: Boolean(
                            (entry.product as { active?: boolean }).active ?? true
                        )
                    } as never)
                )
            ).then(() =>
                hydrateOne(order.get({ plain: true }) as { id: number } & Record<string, unknown>)
            );
        });

/**
 * Saves changes.
 *
 * @param order - Parameter used by this operation.
 */
export const save = (order: IOrderDocument): Promise<IOrderDocument> =>
    orderModel.findByPk(Number(order.id)).then((databaseOrder) => {
        if (!databaseOrder) throw new Error('404');

        return databaseOrder
            .update({
                userId: Number(order.userId),
                email: order.email,
                status: order.status,
                notes: order.notes
            })
            .then(() => {
                if (!order.products) return;
                return orderItemModel.destroy({ where: { orderId: databaseOrder.id } }).then(() =>
                    Promise.all(
                        order.products.map((entry) =>
                            orderItemModel.create({
                                orderId: databaseOrder.id,
                                productId: extractProductId(entry.product),
                                quantity: Number(entry.quantity),
                                productTitle: String(
                                    (entry.product as { title?: string }).title ?? ''
                                ),
                                productPrice: Number(
                                    (entry.product as { price?: number }).price ?? 0
                                ),
                                productDescription: String(
                                    (entry.product as { description?: string }).description ?? ''
                                ),
                                productImageUrl: String(
                                    (entry.product as { imageUrl?: string }).imageUrl ?? ''
                                ),
                                productActive: Boolean(
                                    (entry.product as { active?: boolean }).active ?? true
                                )
                            } as never)
                        )
                    )
                );
            })
            .then(() =>
                hydrateOne(
                    databaseOrder.get({ plain: true }) as { id: number } & Record<string, unknown>
                )
            );
    });

/**
 * Deletes one.
 *
 * @param order - Parameter used by this operation.
 */
export const deleteOne = (order: IOrderDocument): Promise<void> =>
    orderModel.destroy({ where: { id: Number(order.id) } }).then(() => {});

export const orderRepository = { aggregate, findById, create, save, deleteOne };
