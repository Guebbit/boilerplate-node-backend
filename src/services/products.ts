/* eslint-disable unicorn/no-null */
import { t } from 'i18next';
import { Op } from 'sequelize';
import type { SearchProductsRequest, ProductsResponse, Product } from '@types';
import {
    generateReject,
    generateSuccess,
    type IResponseReject,
    type IResponseSuccess
} from '@utils/response';
import { deleteFile } from '@utils/helpers-filesystem';
import { cartService } from '@services/cart';
import { zodProductSchema } from '@models/products';
import type { IProductDocument } from '@models/products';
import { productRepository } from '@repositories/products';

/**
 * Converts product response item.
 *
 * @param item - Item processed by the operation.
 */
const toProductResponseItem = (item: IProductDocument): ProductsResponse['items'][number] => ({
    id: String(item.id),
    title: item.title,
    price: item.price,
    description: item.description,
    active: item.active,
    imageUrl: item.imageUrl,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    deletedAt: item.deletedAt ?? undefined
});

/**
 * Validates data.
 *
 * @param productData - Product payload to validate.
 */
export const validateData = (productData: Omit<Product, 'id'>): string[] => {
    const parseResult = zodProductSchema.safeParse(productData);
    if (!parseResult.success) return parseResult.error.issues.map(({ message }) => message);
    return [];
};

/**
 * Searches records.
 *
 * @param filters - Filter criteria used to query records.
 * @param admin - Whether admin-level visibility rules should be applied.
 */
export const search = (
    filters: SearchProductsRequest = {},
    admin = false
): Promise<ProductsResponse> => {
    const page = Math.max(1, Number(filters.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize ?? 10) || 10));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};

    if (filters.id && String(filters.id).trim() !== '') where.id = Number(filters.id);

    if (filters.text && String(filters.text).trim() !== '') {
        const text = String(filters.text).trim();
        where.or = [{ title: { contains: text } }, { description: { contains: text } }];
    }

    const priceConditions: Record<string, number> = {};
    if (
        filters.minPrice !== undefined &&
        filters.minPrice !== null &&
        !Number.isNaN(Number(filters.minPrice))
    )
        priceConditions.min = Number(filters.minPrice);
    if (
        filters.maxPrice !== undefined &&
        filters.maxPrice !== null &&
        !Number.isNaN(Number(filters.maxPrice))
    )
        priceConditions.max = Number(filters.maxPrice);
    if (Object.keys(priceConditions).length > 0) where.price = priceConditions;

    if (!admin) {
        where.active = true;
        where.deletedAt = null;
    }

    return productRepository.count(where).then((totalItems) =>
        productRepository
            .findAll(where, {
                sort: { createdAt: -1 },
                skip,
                limit: pageSize
            })
            .then((items) => ({
                items: items.map((item) => toProductResponseItem(item)),
                meta: {
                    page,
                    pageSize,
                    totalItems,
                    totalPages: Math.ceil(totalItems / pageSize)
                }
            }))
    );
};

/**
 * Gets by id.
 *
 * @param id - Resource identifier.
 * @param admin - Whether admin-level visibility rules should be applied.
 */
export const getById = (id: string | undefined, admin = false) => {
    if (!id) return Promise.resolve();
    if (admin) return productRepository.findById(id).then((product) => product?.toObject());
    return productRepository
        .findOne({
            id: Number(id),
            active: true,
            deletedAt: null
        })
        .then((product) => product?.toObject() ?? null);
};

/**
 * Creates a record.
 *
 * @param data - Payload containing values to create or update.
 */
export const create = (data: Omit<Product, 'id'>): Promise<IProductDocument> =>
    productRepository.create(data);

/**
 * Updates a record.
 *
 * @param id - Resource identifier.
 * @param data - Payload containing values to create or update.
 */
export const update = (
    id: string,
    data: Partial<Omit<Product, 'id'>>
): Promise<IProductDocument> => {
    return productRepository.findById(id).then((product) => {
        if (!product) throw new Error('404');

        if (data.title !== undefined) product.title = data.title;
        if (data.price !== undefined) product.price = data.price;
        if (data.description !== undefined) product.description = data.description;
        if (data.active !== undefined) product.active = data.active;

        const oldImageUrl = product.imageUrl;
        const newImageUrl = data.imageUrl ?? '';
        if (newImageUrl && oldImageUrl !== newImageUrl) product.imageUrl = newImageUrl;

        return productRepository
            .save(product)
            .then((updatedProduct) =>
                (newImageUrl && oldImageUrl !== newImageUrl
                    ? deleteFile((process.env.NODE_PUBLIC_PATH ?? 'public') + oldImageUrl)
                    : Promise.resolve()
                ).then(() => updatedProduct)
            );
    });
};

/**
 * Removes a record.
 *
 * @param id - Resource identifier.
 * @param hardDelete - When true, permanently deletes the record.
 */
export const remove = (
    id: string,
    hardDelete = false
): Promise<IResponseSuccess<IProductDocument> | IResponseSuccess<undefined> | IResponseReject> => {
    return productRepository.findById(id).then((product) => {
        if (!product) return generateReject(404, '404', [t('ecommerce.product-not-found')]);

        if (hardDelete)
            return cartService
                .productRemoveFromCartsById(String(product.id))
                .then(() => productRepository.deleteOne(product))
                .then(() =>
                    deleteFile((process.env.NODE_PUBLIC_PATH ?? 'public') + product.imageUrl)
                )
                .then(() => generateSuccess(undefined, 200, t('ecommerce.product-hard-deleted')));

        product.deletedAt = product.deletedAt ? null : new Date();

        return cartService
            .productRemoveFromCartsById(String(product.id))
            .then(() => productRepository.save(product))
            .then((savedProduct) =>
                generateSuccess(savedProduct, 200, t('ecommerce.product-soft-deleted'))
            );
    });
};

export const productService = { validateData, search, getById, create, update, remove };
