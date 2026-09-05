/**
 * @module
 * Product service: all business logic for the catalogue entity. Delegates raw database access to
 * the repository and stays the one place a controller may call into.
 */

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
import { enqueueImageDigest } from '@infrastructure/adapters/image.worker';
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
 * Validates product data against the Zod schema; empty array means valid.
 * Takes `unknown` on purpose: this is the boundary that establishes the type, so callers passing
 * raw request bodies don't have to cast on the way in.
 *
 * @param productData
 */
export const validateData = (productData: unknown): ResponseErrorItem[] => {
    const parseResult = zodProductSchema.safeParse(productData);
    if (!parseResult.success) return validationErrors(parseResult.error);
    return [];
};

/** Trim, drop blanks, and de-duplicate a category/tag list; `null`/non-array input becomes empty. */
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
 * @param filters - id, text, minPrice, maxPrice, page (1-based), pageSize
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
 * Enqueue the digest job for a just-persisted product, when its write carried a pending upload.
 * Fire-and-forget, like `enqueueEmail`: a `pendingImageKey` here means a broker accepted the
 * upload at request time (the no-broker path resolves inline before saving, see
 * `readUploadedImage`) — this is a queue publish, and the caller must not wait on it.
 */
const enqueueIfPending = (product: ProductDocument): ProductDocument => {
    if (product.pendingImageKey)
        void enqueueImageDigest(
            {
                collection: 'products',
                documentId: String(product._id),
                key: product.pendingImageKey
            },
            productRepository.writebackImage
        );
    return product;
};

/**
 * Create a new product document in the database.
 *
 * @param data
 */
export const create = (
    data: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> & {
        /** Set alongside the pending-image placeholder — see `readUploadedImage`. */
        pendingImageKey?: string;
    },
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
            return enqueueIfPending(product);
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
    data: Partial<Omit<Product, 'id'>> & {
        /** Set alongside a new pending-image placeholder — see `readUploadedImage`. */
        pendingImageKey?: string;
    }
): Promise<ProductDocument> => {
    // Apply incoming field changes
    if (data.title !== undefined) product.title = data.title;
    if (data.price !== undefined) product.price = data.price;
    /*
     * No stock write here, and the contract no longer offers one: `UpdateProductRequest` and its
     * siblings carry no counter field.
     *
     * This used to be an absolute stock write, which is what made it wrong: setting a count to 40
     * says nothing about what happened, so the ledger had to guess by subtracting the old value —
     * two concurrent edits could each overwrite the other's sale. Counters now move only through
     * signed, conditional transitions in `@modules/inventory` (`POST /inventory/receipts`,
     * `POST /inventory/adjustments`), each of which says what happened and can't lose a sale.
     */
    if (data.description !== undefined) product.description = data.description;
    if (data.active !== undefined) product.active = data.active;
    if (data.categories !== undefined) product.categories = sanitizeStringArray(data.categories);
    if (data.tags !== undefined) product.tags = sanitizeStringArray(data.tags);

    // If a new image was uploaded, update the url, thumbnail and pending key together — the three
    // travel as one unit, all produced by the same `readUploadedImage` call on the controller.
    const oldImageUrl = product.imageUrl;
    const newImageUrl = data.imageUrl ?? '';
    const imageReplaced = Boolean(newImageUrl) && oldImageUrl !== newImageUrl;
    if (imageReplaced) {
        product.imageUrl = newImageUrl;
        product.thumbnailUrl = data.thumbnailUrl;
        product.pendingImageKey = data.pendingImageKey;
    }

    // Persist the updated document
    return productRepository.save(product).then((updatedProduct) => {
        // After saving the new image path, delete the old image file (and its thumbnail)
        return (imageReplaced ? imageStore.remove(oldImageUrl) : Promise.resolve()).then(() =>
            enqueueIfPending(updatedProduct)
        );
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
    data: Partial<Omit<Product, 'id'>> & { pendingImageKey?: string },
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
 * Remove a product document (soft or hard delete). Hard delete also removes the image file;
 * soft delete toggles `deletedAt`, acting as a restore when already soft-deleted.
 *
 * `product.deleted` is emitted and awaited before the write, so a listener that cleans up
 * references (cart empties the product from every cart) has run before it can stop resolving —
 * this module doesn't know who listens, which keeps the dependency arrow one-way.
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
 * A pass-through today — `facets()` on the repository already scopes to active, non-deleted rows.
 * Kept here anyway since a controller reaching past the service is the one shape this layer stack
 * disallows; see `docs/theory/layers.md`.
 */
const facets = (): Promise<{ categories: FacetCount[]; tags: FacetCount[] }> =>
    productRepository.facets();

/** The service's public surface — every controller and cross-module caller goes through this. */
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
