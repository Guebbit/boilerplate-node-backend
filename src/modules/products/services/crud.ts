/**
 * @module
 * Product create, update and update-by-id: what the document holds and what each write announces.
 */

import { t } from '@infrastructure/i18n';
import type { Product, TaxClass, RateType, CallerContext } from '@types';
import {
    generateSuccess,
    generateReject,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { imageStore, applyImageWriteback } from '@infrastructure/adapters/image-store';
import { clearedOrValue } from '@infrastructure/persistence/changes';
import { emitDomainEvent } from '@kernel/events';
import { recordAudit } from '@infrastructure/observability/audit';
import { productsAuditActions } from '../audit';
import { PRODUCT_CREATED, PRODUCT_DEACTIVATED } from '../events';
import type { ProductDocument } from '../model';
import { productRepository } from '../repository';
import { sanitizeStringArray } from './validation';
import { enqueueIfPending } from './image';

/**
 * Create a new product document in the database.
 *
 * Written with `onHand: 0` regardless of what `data.onHand` asks for — this module never moves
 * that counter (see `./model`'s own docblock). `PRODUCT_CREATED` is how the opening count still
 * happens on this same request: `inventory` (which already imports this module, so this cannot
 * import back) is the one subscriber, and moves the counter to `onHand` through its own
 * `receive()` — one call, ledger row included, same as every other stock change. The product is
 * re-read after the awaited emit so the response reflects the real count whether or not that
 * listener succeeded; a throw there leaves `onHand` at the honest `0` it started from, not a lie.
 */
export const create = (
    // `currency` omitted: it's never stored, always read live at serialization — see `./model`'s
    // `applyProductAvailability`.
    data: Omit<
        Product,
        'id' | 'currency' | 'inStock' | 'lowStock' | 'createdAt' | 'updatedAt' | 'deletedAt'
    > & {
        /** Set alongside the pending-image placeholder — see `readUploadedImage`. */
        pendingImageKey?: string;
    },
    context: CallerContext
): Promise<ProductDocument> =>
    productRepository
        .create({
            ...data,
            onHand: 0,
            categories: sanitizeStringArray(data.categories),
            tags: sanitizeStringArray(data.tags)
        })
        .then((product) =>
            emitDomainEvent(PRODUCT_CREATED, {
                productId: String(product._id),
                onHand: data.onHand ?? 0
            }).then(() => productRepository.findById(String(product._id)))
        )
        .then((product) => {
            // Re-read right after our own create(); absent only if something hard-deleted it
            // within that same tick, which nothing in this flow does.
            const created = product!;
            recordAudit(context, {
                action: productsAuditActions.ADMIN_PRODUCT_CREATED,
                outcome: 'success',
                target_type: 'product',
                target_id: String(created._id)
            });
            return enqueueIfPending(created);
        });

/**
 * Update an existing product document.
 * If a new image URL differs from the old one, deletes the old image file after saving.
 */
export const update = (
    product: ProductDocument,
    // `imageUrl`/`weight`/`taxClass`/`rateType`/`sku` widened to accept `null`, since the domain
    // type `Product` states them as a real value or absent-means-zero/standard/unset, never
    // explicitly cleared.
    // `imageUrl: null` unsets the image; `weight`/`taxClass`/`rateType`/`sku: null` genuinely unset
    // them.
    data: Partial<Omit<Product, 'id' | 'imageUrl' | 'weight' | 'taxClass' | 'rateType' | 'sku'>> & {
        /** Set alongside a new pending-image placeholder — see `readUploadedImage`. */
        pendingImageKey?: string;
        imageUrl?: string | null;
        weight?: number | null;
        taxClass?: TaxClass | null;
        rateType?: RateType | null;
        sku?: string | null;
        /**
         * The edit also wrote something OUTSIDE this document (translation rows). Moves
         * `updatedAt` so the row's version — its `ETag` — moves with the edit.
         */
        touch?: boolean;
    }
): Promise<ProductDocument> => {
    // Applying `updatedAt` itself is the timestamps hook's job; this only makes the save non-empty.
    if (data.touch) product.markModified('updatedAt');
    // Apply incoming field changes
    if (data.title !== undefined) product.title = data.title;
    if (data.price !== undefined) product.price = data.price;
    /*
     * No stock write here, and the contract offers none: `UpdateProductRequest` and its
     * siblings carry no counter field.
     *
     * An absolute write would be wrong here: setting a count to 40 says nothing about what
     * happened, so the ledger would have to guess by subtracting the old value, and two concurrent
     * edits could each overwrite the other's sale. Counters move only through signed, conditional
     * transitions in `@modules/inventory` (`POST /inventory/receipts`,
     * `POST /inventory/adjustments`), each of which says what happened and can't lose a sale.
     */
    if (data.description !== undefined) product.description = data.description;
    if (data.active !== undefined) product.active = data.active;
    if (data.categories !== undefined) product.categories = sanitizeStringArray(data.categories);
    if (data.tags !== undefined) product.tags = sanitizeStringArray(data.tags);
    // `null` clears a recorded weight back to unset — $unset on save.
    if (data.weight !== undefined) product.weight = clearedOrValue(data.weight);
    // `null` clears the class back to the shop's standard rate — $unset on save, same as weight.
    if (data.taxClass !== undefined) product.taxClass = clearedOrValue(data.taxClass);
    // `null` clears it back to `standard` — $unset on save, same as taxClass.
    if (data.rateType !== undefined) product.rateType = clearedOrValue(data.rateType);
    // `null` clears the SKU back to unset — $unset on save, same as weight/taxClass. The unique
    // sparse index (`sku_1` on `productSchema`) is what turns a collision into a 409, not this.
    if (data.sku !== undefined) product.sku = clearedOrValue(data.sku);
    if (data.requiresShipping !== undefined) product.requiresShipping = data.requiresShipping;
    if (data.noWithdrawal !== undefined) product.noWithdrawal = data.noWithdrawal;

    // If a new image was uploaded, update the url, thumbnail and pending key together — see
    // `applyImageWriteback`'s own docblock for the gate shared with `users`' own `update`.
    // `imageUrl: null` unsets the field; the old-image deletion below then covers it too.
    const oldImageUrl = applyImageWriteback(product, data);

    // Persist the updated document
    return productRepository.save(product).then((updatedProduct) => {
        // After saving the new image path, delete the old image file (and its thumbnail).
        return (oldImageUrl ? imageStore.remove(oldImageUrl) : Promise.resolve()).then(() =>
            enqueueIfPending(updatedProduct)
        );
    });
};

/**
 * Update an existing product by ID.
 * Fetches the document then delegates to update().
 */
export const updateById = (
    id: string,
    // `imageUrl`/`weight`/`taxClass`/`rateType`/`sku` widened to accept `null` — see `update`'s
    // own docblock.
    data: Partial<Omit<Product, 'id' | 'imageUrl' | 'weight' | 'taxClass' | 'rateType' | 'sku'>> & {
        pendingImageKey?: string;
        imageUrl?: string | null;
        weight?: number | null;
        taxClass?: TaxClass | null;
        rateType?: RateType | null;
        sku?: string | null;
        /** See `update`'s own `touch`. */
        touch?: boolean;
    },
    context: CallerContext
): Promise<ResponseSuccess<ProductDocument> | ResponseReject> =>
    productRepository.findById(id).then((product) => {
        // Returned, not thrown: a thrown miss is indistinguishable from a genuine database error
        // at the `.catch()` that has to tell them apart.
        if (!product) return generateReject(404, [t('products.not-found')]);

        // Read before `update()` mutates `product.active` in place — the flip is the whole
        // signal `PRODUCT_DEACTIVATED` exists to report, same shape `users`' ban/unban audit uses.
        const wasActive = product.active;

        return update(product, data).then((updated) => {
            recordAudit(context, {
                action: productsAuditActions.ADMIN_PRODUCT_UPDATED,
                outcome: 'success',
                target_type: 'product',
                target_id: id
            });

            return (
                wasActive !== false && updated.active === false
                    ? emitDomainEvent(PRODUCT_DEACTIVATED, { productId: id })
                    : Promise.resolve()
            ).then(() => generateSuccess(updated));
        });
    });
