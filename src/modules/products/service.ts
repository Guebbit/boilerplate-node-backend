import type { Types } from 'mongoose';
import { t } from '@infrastructure/i18n';
import type { SearchProductsRequest, Product } from '@types';
import {
    generateReject,
    generateSuccess,
    type IResponseReject,
    type IResponseSuccess
} from '@infrastructure/http/response';
import { imageStore } from '@infrastructure/adapters/image-store';
import { emitDomainEvent } from '@kernel/events';
import { PRODUCT_DELETED } from './events';
import { zodProductSchema } from './model';
import type { IProductDocument } from './model';
import { productRepository } from './repository';

/**
 * Product Service
 * Handles all business logic for the Product entity.
 * Delegates raw database access to Product Repository.
 */

/**
 * Validate product data using the Zod schema.
 * Returns an array of UI-friendly error messages (empty array means valid).
 *
 * Takes `unknown` on purpose: this is the boundary that ESTABLISHES the type. Declaring a
 * narrower parameter would force every caller — all of which hold raw request bodies — to cast
 * on the way in, which is precisely the assertion this function exists to replace.
 *
 * @param productData
 */
export const validateData = (productData: unknown): string[] => {
    const parseResult = zodProductSchema.safeParse(productData);
    if (!parseResult.success) return parseResult.error.issues.map(({ message }) => message);
    return [];
};

const sanitizeStringArray = (values?: string[] | null): string[] => {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
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
): Promise<{
    items: IProductDocument[];
    meta: { page: number; pageSize: number; totalItems: number; totalPages: number };
}> =>
    // The only product-domain decision left here: admins see everything, everyone else sees the
    // published catalogue. How `text`/`category`/`tag`/`minPrice`/`maxPrice` become a query is
    // declared on the repository.
    productRepository.search(filters, admin ? {} : productRepository.publicScope());

/**
 * Get a single product by ID.
 * Admin can see inactive or soft-deleted products; non-admin cannot.
 * Returns undefined if the id is falsy; null if no matching document is found.
 *
 * @param id
 * @param admin
 */
export const getById = (id: string | undefined, admin = false) => {
    // Return early without triggering a DB call when no id is provided
    if (!id) return Promise.resolve();
    if (admin) return productRepository.findById(id);
    return productRepository.findOne({ _id: id, ...productRepository.publicScope() });
};

/**
 * Create a new product document in the database.
 *
 * @param data
 */
export const create = (
    data: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>
): Promise<IProductDocument> =>
    productRepository.create({
        ...data,
        categories: sanitizeStringArray(data.categories),
        tags: sanitizeStringArray(data.tags)
    });

/**
 * Update an existing product document.
 * If a new image URL differs from the old one, deletes the old image file after saving.
 *
 * @param product
 * @param data
 */
export const update = (
    product: IProductDocument,
    data: Partial<Omit<Product, 'id'>>
): Promise<IProductDocument> => {
    // Apply incoming field changes
    if (data.title !== undefined) product.title = data.title;
    if (data.price !== undefined) product.price = data.price;
    // The admin form is the one legitimate ABSOLUTE stock write — restocking sets a count.
    // Relative changes (sales, cancellations) go through the repository's adjust helpers.
    if (data.stock !== undefined) product.stock = data.stock;
    if (data.description !== undefined) product.description = data.description;
    if (data.active !== undefined) product.active = data.active;
    if (data.categories !== undefined) product.categories = sanitizeStringArray(data.categories);
    if (data.tags !== undefined) product.tags = sanitizeStringArray(data.tags);

    // If a new image was uploaded, update the URL on the document
    const oldImageUrl = product.imageUrl;
    const newImageUrl = data.imageUrl ?? '';
    if (newImageUrl && oldImageUrl !== newImageUrl) product.imageUrl = newImageUrl;

    // Persist the updated document
    return productRepository.save(product).then((updatedProduct) =>
        // After saving the new image path, delete the old image file
        (newImageUrl && oldImageUrl !== newImageUrl
            ? imageStore.remove(oldImageUrl)
            : Promise.resolve()
        ).then(() => updatedProduct)
    );
};

/**
 * Update an existing product by ID.
 * Fetches the document then delegates to update().
 *
 * Reports "no such product" by RETURNING a reject envelope, like `removeById` below and like the
 * order and user services. The alternative — throwing — forced its one caller to recognise the
 * failure by string-matching `error.message === '404'` inside a `.catch()`, where a genuine
 * database error was indistinguishable from a missing row.
 *
 * @param id
 * @param data
 */
export const updateById = (
    id: string,
    data: Partial<Omit<Product, 'id'>>
): Promise<IResponseSuccess<IProductDocument> | IResponseReject> =>
    productRepository.findById(id).then((product) => {
        if (!product) return generateReject(404, [t('products.not-found')]);
        return update(product, data).then((updated) => generateSuccess(updated));
    });

/**
 * Remove a product document (soft or hard delete).
 * Hard delete additionally removes the image file from disk.
 * Soft delete toggles `deletedAt` (acts as a restore if already soft-deleted).
 *
 * `product.deleted` is emitted and awaited before the write in both paths, so a listener that
 * cleans up references — the cart module empties the product out of every user's cart — has run
 * before the product can stop resolving. This module does not know who listens, which is what
 * keeps the dependency arrow pointing cart → products and not both ways.
 *
 * @param product
 * @param hardDelete
 */
export const remove = (
    product: IProductDocument,
    hardDelete = false
): Promise<IResponseSuccess<IProductDocument> | IResponseSuccess<undefined> | IResponseReject> => {
    const id = (product._id as Types.ObjectId).toString();

    // HARD delete
    if (hardDelete)
        return emitDomainEvent(PRODUCT_DELETED, { productId: id })
            .then(() => productRepository.deleteOne(product))
            .then(() => imageStore.remove(product.imageUrl))
            .then(() => generateSuccess(undefined, 200, t('products.hard-deleted')));

    // If deletedAt already present: it's soft-deleted → RESTORE
    product.deletedAt = product.deletedAt ? undefined : new Date();

    // SOFT delete (or restore)
    return emitDomainEvent(PRODUCT_DELETED, { productId: id })
        .then(() => productRepository.save(product))
        .then((savedProduct) => generateSuccess(savedProduct, 200, t('products.soft-deleted')));
};

/**
 * Remove a product by ID (soft or hard delete).
 * Fetches the document then delegates to remove().
 *
 * @param id
 * @param hardDelete
 */
export const removeById = (
    id: string,
    hardDelete = false
): Promise<IResponseSuccess<IProductDocument> | IResponseSuccess<undefined> | IResponseReject> =>
    productRepository.findById(id).then((product) => {
        if (!product) return generateReject(404, [t('products.not-found')]);
        return remove(product, hardDelete);
    });

export const productService = {
    validateData,
    search,
    getById,
    create,
    update,
    updateById,
    remove,
    removeById
};
