import { Types } from 'mongoose';
import { t } from 'i18next';
import type { QueryFilter } from 'mongoose';
import type { SearchProductsRequest, ProductsResponse, Product } from '@types';
import {
    generateReject,
    generateSuccess,
    type IResponseReject,
    type IResponseSuccess
} from '@utils/response';
import { deleteFile } from '@utils/helpers-filesystem';
import UserService from '@services/users';
import { zodProductSchema } from '@models/products';
import type { IProductDocument } from '@models/products';
import ProductRepository from '@repositories/products';

/**
 * Product Service
 * Handles all business logic for the Product entity.
 * Delegates raw database access to Product Repository.
 */

/**
 * Validate product data using the Zod schema.
 * Returns an array of UI-friendly error messages (empty array means valid).
 *
 * @param productData
 */
export const validateData = (productData: Omit<Product, 'id'>): string[] => {
    const parseResult = zodProductSchema.safeParse(productData);
    if (!parseResult.success) return parseResult.error.issues.map(({ message }) => message);
    return [];
};

/**
 * Search products (DTO-friendly) — matches POST /products/search in OpenAPI.
 *
 * Filters: id (product), text, minPrice, maxPrice
 * Pagination: page (1-based), pageSize
 *
 * @param filters
 * @param admin - Admin scope: shows inactive and soft-deleted products
 */
export const search = (
    filters: SearchProductsRequest = {},
    admin = false
): Promise<ProductsResponse> => {
    // Pagination
    const page = Math.max(1, Number(filters.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize ?? 10) || 10));
    const skip = (page - 1) * pageSize;

    // Query builder
    const where: QueryFilter<IProductDocument> = {};

    // Filter by ID
    if (filters.id && String(filters.id).trim() !== '')
        where._id = new Types.ObjectId(String(filters.id));

    // Filter by text (search in title and description)
    if (filters.text && String(filters.text).trim() !== '') {
        const text = String(filters.text).trim();
        // Simple, effective search across title/description (case-insensitive)
        where.$or = [
            {
                title: {
                    $regex: text,
                    $options: 'i' // case-insensitive (optional)
                }
            },
            {
                description: {
                    $regex: text,
                    $options: 'i' // case-insensitive (optional)
                }
            }
        ];
    }

    // Filter by price range
    const priceConditions: Record<string, number> = {};
    if (
        filters.minPrice !== undefined &&
        filters.minPrice !== null &&
        !Number.isNaN(Number(filters.minPrice))
    )
        priceConditions.$gte = Number(filters.minPrice);
    if (
        filters.maxPrice !== undefined &&
        filters.maxPrice !== null &&
        !Number.isNaN(Number(filters.maxPrice))
    )
        priceConditions.$lte = Number(filters.maxPrice);
    if (Object.keys(priceConditions).length > 0) where.price = priceConditions;

    // If not admin, filter out inactive and (soft) deleted products
    if (!admin) {
        where.active = true;
        where.deletedAt = undefined;
    }

    return Promise.all([
        ProductRepository.count(where),
        ProductRepository.findAll(where, {
            sort: { createdAt: -1 },
            skip,
            limit: pageSize
        })
    ]).then(([totalItems, items]) => ({
        items: items as unknown as Product[],
        meta: {
            page,
            pageSize,
            totalItems,
            totalPages: Math.ceil(totalItems / pageSize)
        }
    }));
};

/**
 * Get a single product by ID as a lean (plain JS) object.
 * Admin can see inactive or soft-deleted products; non-admin cannot.
 * Returns undefined if the id is falsy; null if no matching document is found.
 *
 * @param id
 * @param admin
 */
export const getById = (id: string | undefined, admin = false) => {
    // Return early without triggering a DB call when no id is provided
    if (!id) return Promise.resolve();
    if (admin) return ProductRepository.findById(id).lean();
    return ProductRepository.findOne({ _id: id, active: true, deletedAt: undefined }).lean();
};

/**
 * Create a new product document in the database.
 *
 * @param data
 */
export const create = (data: Omit<Product, 'id'>): Promise<IProductDocument> =>
    ProductRepository.create(data);

/**
 * Update an existing product by ID.
 * If a new image URL is provided and differs from the old one,
 * the old image file is deleted after the save succeeds.
 *
 * @param id
 * @param data
 * @param newImageUrl - new image URL relative to the public directory (empty string means no change)
 */
export const update = (
    id: string,
    data: Partial<Omit<Product, 'id'>>,
    newImageUrl = ''
): Promise<IProductDocument> =>
    ProductRepository.findById(id).then((product) => {
        if (!product) throw new Error('404');

        // Apply incoming field changes
        if (data.title !== undefined) product.title = data.title;
        if (data.price !== undefined) product.price = data.price;
        if (data.description !== undefined) product.description = data.description;
        if (data.active !== undefined) product.active = data.active;

        // If a new image was uploaded, update the URL on the document
        const oldImageUrl = product.imageUrl;
        if (newImageUrl && oldImageUrl !== newImageUrl) product.imageUrl = newImageUrl;

        // Persist the updated document
        return ProductRepository.save(product).then((updatedProduct) => {
            // After saving the new image path, delete the old image file
            if (newImageUrl && oldImageUrl !== newImageUrl)
                return deleteFile((process.env.NODE_PUBLIC_PATH ?? 'public') + oldImageUrl).then(
                    () => updatedProduct
                );
            return updatedProduct;
        });
    });

/**
 * Remove a product by ID (soft or hard delete).
 * Always removes the product from all user carts.
 * Hard delete additionally removes the image file from disk.
 * Soft delete toggles `deletedAt` (acts as a restore if already soft-deleted).
 *
 * @param id
 * @param hardDelete
 */
export const remove = (
    id: string,
    hardDelete = false
): Promise<IResponseSuccess<IProductDocument> | IResponseSuccess<undefined> | IResponseReject> =>
    ProductRepository.findById(id).then((product) => {
        // not found, something happened
        if (!product) return generateReject(404, '404', [t('ecommerce.product-not-found')]);

        // HARD delete
        if (hardDelete)
            return UserService.productRemoveFromCartsById(
                (product._id as Types.ObjectId).toString()
            )
                .then(() => ProductRepository.deleteOne(product))
                .then(() =>
                    deleteFile((process.env.NODE_PUBLIC_PATH ?? 'public') + product.imageUrl)
                )
                .then(() => generateSuccess(undefined, 200, t('ecommerce.product-hard-deleted')));

        // If deletedAt already present: it's soft-deleted → RESTORE
        product.deletedAt = product.deletedAt ? undefined : new Date();

        // SOFT delete (or restore)
        return UserService.productRemoveFromCartsById(
            (product._id as Types.ObjectId).toString()
        ).then(() =>
            ProductRepository.save(product).then((savedProduct) =>
                generateSuccess(savedProduct, 200, t('ecommerce.product-soft-deleted'))
            )
        );
    });

export default { validateData, search, getById, create, update, remove };
