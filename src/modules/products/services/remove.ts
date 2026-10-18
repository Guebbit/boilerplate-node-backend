/**
 * @module
 * Soft and hard delete and restore, and what each announces.
 */

import type { ClientSession } from 'mongoose';
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
import { announceInTransaction } from '@kernel/outbox';
import { recordAudit } from '@infrastructure/observability/audit';
import { productsAuditActions } from '../audit';
import { PRODUCT_DELETED } from '../events';
import type { ProductDocument } from '../model';
import { productRepository } from '../repository';
import { titlesOf } from './lookups';

/**
 * Run a delete's write and announce `product.deleted` in the same transaction. The titles are read
 * first: a hard delete's write takes the other languages' rows with it, and the event has to carry
 * the names a subscriber's message will print.
 *
 * @param product - the document being removed
 * @param hardDelete - whether the row goes, which subscribers read off the payload
 * @param write - the delete itself, run inside the transaction
 */
const announceDeleted = <T>(
    product: ProductDocument,
    hardDelete: boolean,
    write: (session: ClientSession) => Promise<T>
): Promise<T> => {
    const id = product._id.toString();
    return titlesOf(product).then((titles) =>
        announceInTransaction(write, () => ({
            name: PRODUCT_DELETED,
            payload: { productId: id, hardDelete, titles },
            aggregateId: id
        }))
    );
};

/**
 * Remove a product document (soft or hard delete). Hard delete also removes the image file;
 * soft delete stamps `deletedAt`, and repeating it is a no-op — DELETE must be safe to retry, so
 * undoing it is {@link restoreById}'s job, never a second DELETE's.
 *
 * `product.deleted` goes through the outbox, written in the same transaction as the delete: it
 * exists exactly when the delete committed, and the relay retries it until every subscriber (cart
 * and wishlist pulling the line) has handled it. This module still doesn't know who listens, which
 * keeps the dependency arrow one-way. The response does not wait for the cascade.
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
        recordAudit(context, {
            action: productsAuditActions.ADMIN_PRODUCT_DELETED,
            outcome: 'success',
            targetType: 'product',
            targetId: id,
            metadata: { hardDelete }
        });
    };

    // Translations go with a HARD delete, in this same transaction — through the port, never the
    // `PRODUCT_DELETED` event: that event fires on a SOFT delete too, with the same `productId` —
    // `hardDelete` on the payload is what lets a subscriber (`inventory`'s level row) tell the two
    // apart. A soft delete can be restored, so both the rows and the counters must survive it.
    if (hardDelete)
        return announceDeleted(product, true, (session) =>
            productRepository
                .deleteOne(product, session)
                .then(() => removeTranslations('product', id, session))
                .then(() => product)
        )
            .then(() => imageStore.remove(product.imageUrl))
            .then(() => auditDeleted())
            .then(() => generateSuccess(undefined, 200, t('products.hard-deleted')));

    // SOFT delete. Already deleted: nothing to do, and nothing to announce again.
    if (product.deletedAt)
        return Promise.resolve(generateSuccess(product, 200, t('products.soft-deleted')));

    product.deletedAt = new Date();
    return announceDeleted(product, false, (session) =>
        productRepository.save(product, session)
    ).then((saved) => {
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
 * wishlists emptied) stays done — a restore clears `deletedAt` only, so the product comes back
 * as it was (on sale, off sale or hidden), not the past.
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
            recordAudit(context, {
                action: productsAuditActions.ADMIN_PRODUCT_RESTORED,
                outcome: 'success',
                targetType: 'product',
                targetId: id
            });
            return generateSuccess(saved, 200, t('products.restored'));
        });
    });
