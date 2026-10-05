/**
 * @module
 * Soft and hard delete and restore, and what each announces.
 */

import { t } from '@infrastructure/i18n';
import { removeTranslations } from '@kernel/translation';
import type { CallerContext } from '@types';
import {
    generateSuccess,
    generateReject,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { imageStore } from '@infrastructure/adapters/image-store';
import { emitDomainEvent } from '@kernel/events';
import { recordAudit } from '@infrastructure/observability/audit';
import { productsAuditActions } from '../audit';
import { PRODUCT_DELETED } from '../events';
import type { ProductDocument } from '../model';
import { productRepository } from '../repository';
import { titlesOf } from './lookups';

/**
 * Remove a product document (soft or hard delete). Hard delete also removes the image file;
 * soft delete stamps `deletedAt`, and repeating it is a no-op — DELETE must be safe to retry, so
 * undoing it is {@link restoreById}'s job, never a second DELETE's.
 *
 * `product.deleted` is emitted and awaited AFTER the write, not before it — a past-tense event is
 * a report, not an "about to happen" hook: firing it first and having the write then fail would
 * leave every subscriber's cascade (cart and wishlist pulling the line)
 * already run against a product that, as far as the database is concerned, was never removed at
 * all. This module still doesn't know who listens, which keeps the dependency arrow one-way.
 *
 * @param hardDelete - `true` destroys the row; `false` stamps `deletedAt` once
 * @param context - records `ADMIN_PRODUCT_DELETED`; omit for a caller with no request behind it
 */
export const remove = (
    product: ProductDocument,
    hardDelete = false,
    context?: CallerContext
): Promise<ResponseSuccess<ProductDocument> | ResponseSuccess<undefined> | ResponseReject> => {
    const id = product._id.toString();

    const auditDeleted = () => {
        if (context)
            recordAudit(context, {
                action: productsAuditActions.ADMIN_PRODUCT_DELETED,
                outcome: 'success',
                target_type: 'product',
                target_id: id,
                metadata: { hardDelete }
            });
    };

    // HARD delete
    // Translations go with it, in this same operation — through the port, never the
    // `PRODUCT_DELETED` event above: that event fires on a SOFT delete too, with the same
    // `productId` — `hardDelete` on the payload is what lets a subscriber (`inventory`'s level
    // row) tell the two apart. A soft delete can be
    // restored, so both the rows and the counters must survive it.
    if (hardDelete)
        // Titles are read first: `removeTranslations` below takes the other languages with it.
        return titlesOf(product)
            .then((titles) =>
                productRepository
                    .deleteOne(product)
                    .then(() => removeTranslations('product', id))
                    .then(() =>
                        emitDomainEvent(PRODUCT_DELETED, {
                            productId: id,
                            hardDelete: true,
                            titles
                        })
                    )
            )
            .then(() => imageStore.remove(product.imageUrl))
            .then(() => auditDeleted())
            .then(() => generateSuccess(undefined, 200, t('products.hard-deleted')));

    // SOFT delete. Already deleted: nothing to do, and nothing to announce again.
    if (product.deletedAt)
        return Promise.resolve(generateSuccess(product, 200, t('products.soft-deleted')));

    product.deletedAt = new Date();
    return titlesOf(product)
        .then((titles) =>
            productRepository.save(product).then((saved) =>
                emitDomainEvent(PRODUCT_DELETED, {
                    productId: id,
                    hardDelete: false,
                    titles
                }).then(() => saved)
            )
        )
        .then((saved) => {
            auditDeleted();
            return generateSuccess(saved, 200, t('products.soft-deleted'));
        });
};

/**
 * Remove a product by ID (soft or hard delete).
 * Fetches the document then delegates to remove().
 *
 * @param hardDelete - `true` destroys the row; `false` stamps `deletedAt` once
 * @param context - forwarded to {@link remove} for the audit row
 */
export const removeById = (
    id: string,
    hardDelete = false,
    context?: CallerContext
): Promise<ResponseSuccess<ProductDocument> | ResponseSuccess<undefined> | ResponseReject> =>
    productRepository
        .findById(id)
        .then((product) =>
            product
                ? remove(product, hardDelete, context)
                : generateReject(404, [t('products.not-found')])
        );

/**
 * Undo a soft delete. Announces nothing: what the delete set in motion (carts and
 * wishlists emptied) stays done — a restore puts the product back on sale, not the past.
 *
 * @param id - the product to restore
 * @param context - records `ADMIN_PRODUCT_RESTORED`; omit for a caller with no request behind it
 * @returns the restored product; 404 when there is none, 409 when it is not soft-deleted
 */
export const restoreById = (
    id: string,
    context?: CallerContext
): Promise<ResponseSuccess<ProductDocument> | ResponseReject> =>
    productRepository.findById(id).then((product) => {
        if (!product) return generateReject(404, [t('products.not-found')]);
        if (!product.deletedAt) return generateReject(409, [t('products.not-deleted')]);
        product.deletedAt = undefined;
        return productRepository.save(product).then((saved) => {
            if (context)
                recordAudit(context, {
                    action: productsAuditActions.ADMIN_PRODUCT_RESTORED,
                    outcome: 'success',
                    target_type: 'product',
                    target_id: id
                });
            return generateSuccess(saved, 200, t('products.restored'));
        });
    });
