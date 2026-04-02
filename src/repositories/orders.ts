/* eslint-disable unicorn/no-null */
import { Op } from 'sequelize';
import { orderModel, type IOrderDocument, type IOrderProduct } from '@models/orders';
import { orderItemModel } from '@models/order-items';

const hydrateOne = async (order: { id: number } & Record<string, unknown>) => {
    const items = await orderItemModel.findAll({ where: { orderId: order.id }, raw: true });
    const products = items.map((item) => ({
        product: {
            id: item.productId ?? undefined,
            _id: item.productId ?? undefined,
            title: item.productTitle,
            price: item.productPrice,
            description: item.productDescription,
            imageUrl: item.productImageUrl,
            active: item.productActive
        },
        quantity: item.quantity
    })) as unknown as IOrderProduct[];

    return {
        ...order,
        _id: order.id,
        products
    } as unknown as IOrderDocument;
};

const hydrateAll = (orders: Array<{ id: number } & Record<string, unknown>>) =>
    Promise.all(orders.map((order) => hydrateOne(order)));

const applyMatch = (rows: IOrderDocument[], match: Record<string, unknown>) => {
    const keys = Object.keys(match);
    return rows.filter((row) =>
        keys.every((key) => {
            if (key === '_id' || key === 'id') return Number(row.id) === Number(match[key]);
            if (key === 'userId') return Number(row.userId) === Number(match[key]);
            if (key === 'email') return String(row.email) === String(match[key]);
            if (key === 'products.product._id')
                return row.products.some(
                    (product) =>
                        Number((product.product as unknown as { id?: number }).id) ===
                        Number(match[key])
                );
            return true;
        })
    );
};

const extractProductId = (product: IOrderProduct['product']): number =>
    Number(
        (product as unknown as { id?: number | string; _id?: number | string }).id ??
            (product as unknown as { _id?: number | string })._id ??
            0
    );

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

export const aggregate = async <T = IOrderDocument>(
    pipeline: Array<Record<string, unknown>>
): Promise<T[]> => {
    let rows = await hydrateAll(
        (await orderModel.findAll({
            order: [['createdAt', 'DESC']],
            raw: true
        })) as unknown as Array<{ id: number } & Record<string, unknown>>
    );

    for (const stage of pipeline) {
        if ('$match' in stage) rows = applyMatch(rows, stage.$match as Record<string, unknown>);
        if ('$sort' in stage) {
            const [field, direction] = Object.entries(
                stage.$sort as Record<string, unknown>
            )[0] ?? ['createdAt', -1];
            // eslint-disable-next-line unicorn/no-array-sort
            rows = [...rows].sort((a, b) => {
                const av = a[field as keyof IOrderDocument] as unknown as number | string | Date;
                const bv = b[field as keyof IOrderDocument] as unknown as number | string | Date;
                const factor = Number(direction) === -1 ? -1 : 1;
                if (av === bv) return 0;
                return av > bv ? factor : -factor;
            });
        }
        if ('$addFields' in stage) rows = addComputedFields(rows) as IOrderDocument[];
        if ('$skip' in stage) rows = rows.slice(Number(stage.$skip));
        if ('$limit' in stage) rows = rows.slice(0, Number(stage.$limit));
        if ('$count' in stage) return [{ [String(stage.$count)]: rows.length } as T];
    }

    return rows as T[];
};

export const findById = (id: string | number) =>
    orderModel.findByPk(Number(id)).then((order) => {
        if (!order) return null;
        return hydrateOne(order.get({ plain: true }) as { id: number } & Record<string, unknown>);
    });

export const create = async (data: Partial<IOrderDocument>): Promise<IOrderDocument> => {
    const order = await orderModel.create({
        userId: Number(data.userId),
        email: String(data.email ?? ''),
        status: data.status,
        notes: data.notes
    } as never);

    const products = (data.products ?? []) as IOrderProduct[];
    await Promise.all(
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
                productImageUrl: String((entry.product as { imageUrl?: string }).imageUrl ?? ''),
                productActive: Boolean((entry.product as { active?: boolean }).active ?? true)
            } as never)
        )
    );

    return hydrateOne(order.get({ plain: true }) as { id: number } & Record<string, unknown>);
};

export const save = async (order: IOrderDocument): Promise<IOrderDocument> => {
    const databaseOrder = await orderModel.findByPk(Number(order.id ?? order._id));
    if (!databaseOrder) throw new Error('404');

    await databaseOrder.update({
        userId: Number(order.userId),
        email: order.email,
        status: order.status,
        notes: order.notes
    });

    if (order.products) {
        await orderItemModel.destroy({ where: { orderId: databaseOrder.id } });
        await Promise.all(
            order.products.map((entry) =>
                orderItemModel.create({
                    orderId: databaseOrder.id,
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
                    productActive: Boolean((entry.product as { active?: boolean }).active ?? true)
                } as never)
            )
        );
    }

    return hydrateOne(
        databaseOrder.get({ plain: true }) as { id: number } & Record<string, unknown>
    );
};

export const deleteOne = (order: IOrderDocument): Promise<void> =>
    orderModel.destroy({ where: { id: Number(order.id ?? order._id) } }).then(() => {});

export const orderRepository = { aggregate, findById, create, save, deleteOne };
