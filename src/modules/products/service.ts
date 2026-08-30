import { t } from '@infrastructure/i18n';
import type { SearchProductsRequest, Product } from '@types';
import {
    generateSuccess,
    generateReject,
    type ResponseReject,
    type ResponseSuccess,
    type ResponseErrorItem,
    validationErrors
} from '@infrastructure/http/response';
import type { FacetCount } from '@types';
import { imageStore } from '@infrastructure/adapters/image-store';
import { emitDomainEvent } from '@kernel/events';
import type { CallerContext } from '@infrastructure/http/request';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { productsAnalyticsEvents } from './analytics';
import { productsAuditActions } from './audit';
import { PRODUCT_DELETED } from './events';
import { zodProductSchema } from './model';
import type { ProductDocument } from './model';
import { productRepository } from './repository';
import type { PaginatedMeta } from '@infrastructure/persistence/search';
import { createVisibilityScope } from '@kernel/authorization';

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
export const validateData = (productData: unknown): ResponseErrorItem[] => {
    const parseResult = zodProductSchema.safeParse(productData);
    if (!parseResult.success) return validationErrors(parseResult.error);
    return [];
};

const sanitizeStringArray = (values?: string[] | null): string[] => {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
};

/**
 * Which products a caller is allowed to read.
 *
 * `undefined` for admins, meaning "no restriction"; the published catalogue for everyone else.
 * Why the scope rides in the read rather than being checked after it is the shared rule's to
 * explain — see `createVisibilityScope`.
 */
export const callerScope = createVisibilityScope(productRepository.publicScope);

/**
 * Search products (DTO-friendly) — matches POST /products/search in OpenAPI.
 *
 * Filters: id (product), text, minPrice, maxPrice
 * Pagination: page (1-based), pageSize
 *
 * @param filters
 * @param scope - which rows this caller may read ({@link callerScope})
 */
export const search = (
    filters: SearchProductsRequest = {},
    scope?: Record<string, unknown>
): Promise<{
    items: ProductDocument[];
    meta: PaginatedMeta;
}> =>
    // How `text`/`category`/`tag`/`minPrice`/`maxPrice` become a query is declared on the
    // repository; the scope it is merged with is the caller's, and no filter may widen it.
    productRepository.search(filters, scope);

/**
 * `GET /products` / `POST /products/search` — search, and report that a search happened.
 *
 * Wraps rather than folds into `search()`: every other caller — unit tests, `facets` below — reads
 * the catalogue without a `CallerContext` to give and without it being a `products_searched`
 * moment.
 */
export const searchViewed = (
    filters: SearchProductsRequest,
    scope: Record<string, unknown> | undefined,
    context: CallerContext
): Promise<{ items: ProductDocument[]; meta: PaginatedMeta }> =>
    search(filters, scope).then((result) => {
        emitAnalyticsEvent({
            ...buildAnalyticsBase(context),
            event: productsAnalyticsEvents.PRODUCTS_SEARCHED,
            properties: {
                text: filters.text,
                page: result.meta.page,
                pageSize: result.meta.pageSize,
                result_count: result.items.length
            }
        });
        return result;
    });

/**
 * Get a single product by ID.
 * Returns undefined if the id is falsy; null if no matching document is found.
 *
 * @param id
 * @param scope - which rows this caller may read ({@link callerScope})
 */
export const getById = (id: string | undefined, scope?: Record<string, unknown>) => {
    // Return early without triggering a DB call when no id is provided
    if (!id) return Promise.resolve();
    return productRepository.findByIdScoped(id, scope);
};

/**
 * `GET /products/:id` — get a product, and report that it was viewed.
 *
 * Wraps rather than folds into `getById()`, for the same reason `searchViewed` does: most callers
 * (unit tests, other services resolving a product they already know about) have no `CallerContext`
 * and are not a `product_viewed` moment.
 */
export const getByIdViewed = (
    id: string | undefined,
    scope: Record<string, unknown> | undefined,
    context: CallerContext
) =>
    getById(id, scope).then((product) => {
        if (product)
            emitAnalyticsEvent({
                ...buildAnalyticsBase(context),
                event: productsAnalyticsEvents.PRODUCT_VIEWED,
                properties: { product_id: id }
            });
        return product;
    });

/**
 * Create a new product document in the database.
 *
 * @param data
 */
export const create = (
    data: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
    context: CallerContext
): Promise<ProductDocument> =>
    productRepository
        .create({
            ...data,
            categories: sanitizeStringArray(data.categories),
            tags: sanitizeStringArray(data.tags)
        })
        .then((product) => {
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: productsAuditActions.ADMIN_PRODUCT_CREATED,
                    outcome: 'success',
                    target_type: 'product',
                    target_id: String(product._id)
                })
            );
            return product;
        });

/**
 * Update an existing product document.
 * If a new image URL differs from the old one, deletes the old image file after saving.
 *
 * @param product
 * @param data
 */
export const update = (
    product: ProductDocument,
    data: Partial<Omit<Product, 'id'>>
): Promise<ProductDocument> => {
    // Apply incoming field changes
    if (data.title !== undefined) product.title = data.title;
    if (data.price !== undefined) product.price = data.price;
    /*
     * No stock write here, and the contract no longer offers one: `UpdateProductRequest` and its
     * three siblings carry no counter field.
     *
     * This used to be the "one legitimate ABSOLUTE stock write", and being absolute is what made
     * it wrong. Setting a count to 40 says nothing about what happened — it is a keystroke, not
     * an event — so the ledger had to guess by subtracting the old value, and two admins editing
     * the same product concurrently would each overwrite the other with a number read before the
     * other's sale. Counters now move only by signed, conditional transitions through
     * `@modules/inventory`: `POST /inventory/receipts` for a delivery, `POST /inventory/adjustments`
     * for a stocktake correction. Both say what happened, and neither can lose a concurrent sale.
     */
    if (data.description !== undefined) product.description = data.description;
    if (data.active !== undefined) product.active = data.active;
    if (data.categories !== undefined) product.categories = sanitizeStringArray(data.categories);
    if (data.tags !== undefined) product.tags = sanitizeStringArray(data.tags);

    // If a new image was uploaded, update the URL on the document
    const oldImageUrl = product.imageUrl;
    const newImageUrl = data.imageUrl ?? '';
    if (newImageUrl && oldImageUrl !== newImageUrl) product.imageUrl = newImageUrl;

    // Persist the updated document
    return productRepository.save(product).then((updatedProduct) => {
        // After saving the new image path, delete the old image file
        return (
            newImageUrl && oldImageUrl !== newImageUrl
                ? imageStore.remove(oldImageUrl)
                : Promise.resolve()
        ).then(() => updatedProduct);
    });
};

/**
 * Update an existing product by ID.
 * Fetches the document then delegates to update().
 *
 * @param id
 * @param data
 */
export const updateById = (
    id: string,
    data: Partial<Omit<Product, 'id'>>,
    context: CallerContext
): Promise<ResponseSuccess<ProductDocument> | ResponseReject> =>
    productRepository.findById(id).then((product) => {
        // Returned, not thrown: a thrown miss is indistinguishable from a genuine database error
        // at the `.catch()` that has to tell them apart.
        if (!product) return generateReject(404, [t('products.not-found')]);

        return update(product, data).then((updated) => {
            emitAuditEvent(
                buildAuditEvent(context, {
                    action: productsAuditActions.ADMIN_PRODUCT_UPDATED,
                    outcome: 'success',
                    target_type: 'product',
                    target_id: id
                })
            );
            return generateSuccess(updated);
        });
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
    product: ProductDocument,
    hardDelete = false
): Promise<ResponseSuccess<ProductDocument> | ResponseSuccess<undefined> | ResponseReject> => {
    const id = product._id.toString();

    // HARD delete
    if (hardDelete)
        return emitDomainEvent(PRODUCT_DELETED, { productId: id })
            .then(() => productRepository.deleteOne(product))
            .then(() => imageStore.remove(product.imageUrl))
            .then(() => generateSuccess(undefined, 200, t('products.hard-deleted')));

    // SOFT delete (or restore)
    // A FLIP, not an assignment: run against an already soft-deleted product this restores it,
    // which is what the `hardDelete: false` half of `hardDeleteSchema` means.
    product.deletedAt = product.deletedAt ? undefined : new Date();
    return emitDomainEvent(PRODUCT_DELETED, { productId: id })
        .then(() => productRepository.save(product))
        .then((saved) => generateSuccess(saved, 200, t('products.soft-deleted')));
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
): Promise<ResponseSuccess<ProductDocument> | ResponseSuccess<undefined> | ResponseReject> =>
    productRepository
        .findById(id)
        .then((product) =>
            product ? remove(product, hardDelete) : generateReject(404, [t('products.not-found')])
        );

/**
 * Every category and tag the PUBLIC catalogue carries, with counts.
 *
 * A pass-through today: the scoping the storefront needs is already in the aggregation
 * (`facets()` matches active, non-deleted rows), so there is no decision left to make here. It
 * exists anyway because a controller reaching past the service is the one shape this layer stack
 * does not allow — see `docs/theory/layers.md`. The day facets grow an audience (admin counts
 * including inactive rows) or a cached variant, this is where that goes, and no controller has to
 * be rewritten to make room for it.
 */
const facets = (): Promise<{ categories: FacetCount[]; tags: FacetCount[] }> =>
    productRepository.facets();

export const productService = {
    validateData,
    callerScope,
    search,
    searchViewed,
    facets,
    getById,
    getByIdViewed,
    create,
    update,
    updateById,
    remove,
    removeById
};
