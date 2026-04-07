import { t } from 'i18next';
import { Order as ApiOrderModel } from '@api/model/order';
import type { SearchOrdersRequest, OrdersResponse, Order, CartItem } from '@types';
import { ORDER_STATUS, type EOrderStatus, type IOrderDocument, type IOrderProduct } from '@models/orders';
import {
    generateReject,
    generateSuccess,
    type IResponseReject,
    type IResponseSuccess
} from '@utils/response';
import { productRepository } from '@repositories/products';
import { orderRepository } from '@repositories/orders';

export const getAll = (pipeline: Array<Record<string, unknown>> = []): Promise<IOrderDocument[]> =>
    orderRepository.aggregate([...pipeline, { addFields: {} }]);

const isOrderStatus = (value: string): value is EOrderStatus =>
    (Object.values(ORDER_STATUS) as string[]).includes(value);

const orderStatusToApi: Record<EOrderStatus, Order['status']> = {
    [ORDER_STATUS.PENDING]: ApiOrderModel.StatusEnum.Pending,
    [ORDER_STATUS.PAID]: ApiOrderModel.StatusEnum.Paid,
    [ORDER_STATUS.PROCESSING]: ApiOrderModel.StatusEnum.Processing,
    [ORDER_STATUS.SHIPPED]: ApiOrderModel.StatusEnum.Shipped,
    [ORDER_STATUS.DELIVERED]: ApiOrderModel.StatusEnum.Delivered,
    [ORDER_STATUS.CANCELLED]: ApiOrderModel.StatusEnum.Cancelled
};

type ResolvedProduct = NonNullable<Awaited<ReturnType<typeof productRepository.findById>>>;
type MaybeResolvedOrderItem = { item: CartItem; product: ResolvedProduct | null };
type ResolvedOrderItem = { item: CartItem; product: ResolvedProduct };

const hasResolvedProduct = (value: MaybeResolvedOrderItem): value is ResolvedOrderItem =>
    value.product !== null;

const toOrderProduct = ({ item, product }: ResolvedOrderItem): IOrderProduct => ({
    product: {
        id: Number(product.id),
        title: product.title,
        price: product.price,
        description: product.description,
        imageUrl: product.imageUrl,
        active: product.active
    },
    quantity: item.quantity
});

const toOrderResponse = (
    order: IOrderDocument & Partial<{ totalItems: number; totalQuantity: number; totalPrice: number }>
): Order & Partial<{ totalItems: number; totalQuantity: number; totalPrice: number }> => {
    const items = order.products.map(({ product, quantity }) => ({
        productId: String(product.id ?? ''),
        quantity
    }));
    const total = order.products.reduce(
        (sum, entry) => sum + Number(entry.product.price ?? 0) * entry.quantity,
        0
    );

    return {
        id: String(order.id),
        userId: String(order.userId),
        email: order.email,
        items,
        total,
        notes: order.notes,
        status: orderStatusToApi[order.status],
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        ...(order.totalItems === undefined ? {} : { totalItems: order.totalItems }),
        ...(order.totalQuantity === undefined ? {} : { totalQuantity: order.totalQuantity }),
        ...(order.totalPrice === undefined ? {} : { totalPrice: order.totalPrice })
    };
};

export const search = (
    search: SearchOrdersRequest = {},
    scope?: Record<string, unknown>
): Promise<OrdersResponse> => {
    const page = Math.max(1, Number(search.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(search.pageSize ?? 10) || 10));
    const skip = (page - 1) * pageSize;

    const match: Record<string, unknown> = { ...scope };

    if (search.id && String(search.id).trim() !== '') match.id = Number(search.id);

    if (search.userId && String(search.userId).trim() !== '') match.userId = Number(search.userId);

    if (search.email && String(search.email).trim() !== '')
        match.email = String(search.email).trim();

    if (search.productId && String(search.productId).trim() !== '')
        match['products.product.id'] = Number(search.productId);

    const basePipeline: Array<Record<string, unknown>> = [
        { match: match },
        { sort: { createdAt: -1 } },
        { addFields: {} }
    ];

    return orderRepository
        .aggregate<{ totalItems?: number }>([...basePipeline, { count: 'totalItems' }])
        .then(([countAggregation]) => {
            const totalItems = countAggregation?.totalItems ?? 0;
            const totalPages = Math.ceil(totalItems / pageSize);

            return orderRepository
                .aggregate([...basePipeline, { skip: skip }, { limit: pageSize }])
                .then((items) => ({
                    items: items.map((item) => toOrderResponse(item)),
                    meta: {
                        page,
                        pageSize,
                        totalItems,
                        totalPages
                    }
                }));
        });
};

export const getById = (
    id: string | undefined,
    scope?: Record<string, unknown>
): Promise<IOrderDocument | null | void> => {
    if (!id) return Promise.resolve();
    if (scope) {
        return orderRepository
            .aggregate([
                {
                    match: { id: Number(id), ...scope } as Record<string, unknown>
                },
                { limit: 1 },
                { addFields: {} }
            ])
            .then(([result]) => result ?? undefined);
    }
    return orderRepository.findById(id);
};

export const create = (
    userId: string,
    email: string,
    items: CartItem[]
): Promise<IResponseSuccess<IOrderDocument> | IResponseReject> => {
    if (!items || items.length === 0)
        return Promise.resolve(
            generateReject(422, 'create order - empty items', [t('generic.error-missing-data')])
        );

    return Promise.all(
        items.map((item) =>
            productRepository.findById(item.productId).then((product) => ({ item, product }))
        )
    ).then((resolvedItems) => {
        const missingProduct = resolvedItems.some(({ product }) => !product);
        if (missingProduct)
            return generateReject(404, 'create order - product not found', [
                t('ecommerce.product-not-found')
            ]);

        const products = resolvedItems
            .filter((value) => hasResolvedProduct(value))
            .map((value) => toOrderProduct(value));

        return orderRepository
            .create({
                userId: Number(userId),
                email,
                products
            } as Partial<IOrderDocument>)
            .then((order) => generateSuccess(order, 201, t('ecommerce.order-creation-success')));
    });
};

export const update = (
    id: string,
    data: {
        status?: string;
        email?: string;
        userId?: string;
        items?: CartItem[];
    }
): Promise<IResponseSuccess<IOrderDocument> | IResponseReject> => {
    return orderRepository.findById(id).then((order) => {
        if (!order) return generateReject(404, '404', [t('ecommerce.order-not-found')]);

        if (data.status !== undefined) {
            if (!isOrderStatus(data.status))
                return generateReject(422, 'update order - invalid status', [
                    t('generic.error-invalid-data')
                ]);
            order.status = data.status;
        }
        if (data.email !== undefined) order.email = data.email;
        if (data.userId !== undefined) order.userId = Number(data.userId);

        const updateProductsPromise =
            data.items && data.items.length > 0
                ? Promise.all(
                      data.items.map((item) =>
                          productRepository
                              .findById(item.productId)
                              .then((product) => ({ item, product }))
                      )
                  ).then((resolvedItems) => {
                      const missingProduct = resolvedItems.some(({ product }) => !product);
                      if (missingProduct)
                          return generateReject(404, 'update order - product not found', [
                              t('ecommerce.product-not-found')
                          ]);

                        order.products = resolvedItems
                            .filter((value) => hasResolvedProduct(value))
                            .map((value) => toOrderProduct(value));
                    })
                : Promise.resolve();

        return updateProductsPromise.then((earlyResult) => {
            if (earlyResult) return earlyResult;
            return orderRepository.save(order).then((saved) => generateSuccess(saved));
        });
    });
};

export const remove = (id: string): Promise<IResponseSuccess<undefined> | IResponseReject> => {
    return orderRepository.findById(id).then((order) => {
        if (!order) return generateReject(404, '404', [t('ecommerce.order-not-found')]);
        return orderRepository
            .deleteOne(order)
            .then(() => generateSuccess(undefined, 200, t('ecommerce.order-deleted')));
    });
};

export const orderService = { getAll, search, getById, create, update, remove };
