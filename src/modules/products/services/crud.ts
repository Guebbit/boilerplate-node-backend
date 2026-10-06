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
import { rearmPrecondition } from '@infrastructure/persistence/versioning';
import type { ClientSession } from 'mongoose';
import { enqueueOutboxEvent, nudgeOutbox } from '@kernel/outbox';
import { withTransaction } from '@infrastructure/runtime/database';
import { logger } from '@infrastructure/adapters/logger';
import { recordAudit } from '@infrastructure/observability/audit';
import { productsAuditActions } from '../audit';
import { PRODUCT_CREATED, PRODUCT_DEACTIVATED } from '../events';
import type { ProductDocument } from '../model';
import { productRepository } from '../repository';
import { sanitizeStringArray } from './validation';
import { enqueueIfPending } from './image';

/** What `create` accepts: the product's fields, plus the pending-image placeholder's key. */
type ProductCreateData = Omit<
    Product,
    'id' | 'currency' | 'inStock' | 'lowStock' | 'createdAt' | 'updatedAt' | 'deletedAt'
> & {
    /** Set alongside the pending-image placeholder — see `readUploadedImage`. */
    pendingImageKey?: string;
};

/**
 * What `update` accepts.
 *
 * `imageUrl`/`weight`/`taxClass`/`rateType`/`sku` are widened to accept `null`, since the domain
 * type `Product` states them as a real value or absent-means-zero/standard/unset, never
 * explicitly cleared. `imageUrl: null` unsets the image; `weight`/`taxClass`/`rateType`/`sku: null`
 * genuinely unset them.
 */
type ProductUpdateData = Partial<
    Omit<Product, 'id' | 'imageUrl' | 'weight' | 'taxClass' | 'rateType' | 'sku'>
> & {
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
};

/**
 * Runs one post-commit step and swallows only its own failure, with a log line.
 *
 * Everything after the commit is best-effort by design: the product is already written, so a
 * failed audit entry, image enqueue or old-image delete must not turn a committed write into an
 * error response — and one failing must not stop the next.
 *
 * @param step - what the step is, for the log
 * @param run - the step itself
 */
const afterCommitStep = (step: string, run: () => unknown): Promise<void> =>
    Promise.resolve()
        .then(run)
        .then(() => undefined)
        .catch((error: unknown) => {
            logger.error({ message: `Product write: post-commit step failed: ${step}.`, error });
        });

/**
 * Writes a product row and announces it — inside the caller's transaction.
 *
 * Written with `onHand: 0` regardless of what `data.onHand` asks for — this module never moves
 * that counter (see `./model`'s own docblock). `PRODUCT_CREATED` is how the opening count still
 * happens: `inventory` (which already imports this module, so this cannot import back) is the one
 * subscriber, and moves the counter to `onHand` through its own `receive()`. The event goes
 * through the outbox, so it exists exactly when the row does — the response may show `onHand: 0`
 * until the relay has delivered it.
 *
 * @param data - the product's fields
 * @param session - the transaction every write of this product joins
 */
export const insertProduct = (
    // `currency` omitted: it's never stored, always read live at serialization — see `./model`'s
    // `applyProductAvailability`.
    data: ProductCreateData,
    session: ClientSession
): Promise<ProductDocument> =>
    productRepository
        .create(
            {
                ...data,
                onHand: 0,
                categories: sanitizeStringArray(data.categories),
                tags: sanitizeStringArray(data.tags)
            },
            session
        )
        .then((product) =>
            enqueueOutboxEvent(
                PRODUCT_CREATED,
                { productId: String(product._id), onHand: data.onHand ?? 0 },
                String(product._id),
                session
            ).then(() => product)
        );

/**
 * Everything a create does after its transaction has committed: wake the relay, re-read the
 * product, audit, hand a pending image to the queue. Each step catches its own failure.
 *
 * @param product - the row the transaction wrote
 * @param context - the caller, for the audit entry
 */
export const finishCreate = (
    product: ProductDocument,
    context: CallerContext
): Promise<ProductDocument> => {
    nudgeOutbox();
    const id = String(product._id);

    return productRepository
        .findById(id)
        .then((reread) => reread ?? product)
        .then((created) =>
            afterCommitStep('audit', () =>
                recordAudit(context, {
                    action: productsAuditActions.ADMIN_PRODUCT_CREATED,
                    outcome: 'success',
                    target_type: 'product',
                    target_id: id
                })
            )
                .then(() => enqueueIfPending(created))
                .catch((error: unknown) => {
                    logger.error({
                        message: 'Product write: post-commit step failed: image enqueue.',
                        error
                    });
                    return created;
                })
        );
};

/**
 * Create a new product document in the database, in its own transaction.
 * See {@link insertProduct} for what the row and its event carry.
 */
export const create = (data: ProductCreateData, context: CallerContext): Promise<ProductDocument> =>
    withTransaction((session) => insertProduct(data, session)).then((product) =>
        finishCreate(product, context)
    );

/** What a transactional update leaves for after the commit. */
export interface ProductUpdateOutcome {
    /** The saved document. */
    updated: ProductDocument;
    /** The image url it replaced, to delete once the commit is durable. */
    oldImageUrl: string | undefined;
}

/**
 * Applies a change-set to a fetched product and saves it — inside the caller's transaction.
 *
 * @param product - the fetched document
 * @param data - the changes
 * @param session - the transaction the save joins
 */
export const applyUpdate = (
    product: ProductDocument,
    data: ProductUpdateData,
    session: ClientSession
): Promise<ProductUpdateOutcome> => {
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
    // `imageUrl: null` unsets the field; the old-image deletion after the commit covers it too.
    const oldImageUrl = applyImageWriteback(product, data);

    return productRepository.save(product, session).then((updated) => ({ updated, oldImageUrl }));
};

/**
 * What an update does after its transaction has committed: wake the relay, delete the replaced
 * image (and its thumbnail), hand a pending image to the queue. Each step catches its own failure.
 *
 * @param outcome - what the transaction saved
 */
export const finishUpdate = (outcome: ProductUpdateOutcome): Promise<ProductDocument> => {
    nudgeOutbox();
    const { updated, oldImageUrl } = outcome;

    return afterCommitStep('old image removal', () =>
        oldImageUrl ? imageStore.remove(oldImageUrl) : undefined
    )
        .then(() => enqueueIfPending(updated))
        .catch((error: unknown) => {
            logger.error({
                message: 'Product write: post-commit step failed: image enqueue.',
                error
            });
            return updated;
        });
};

/**
 * Update an existing product document, in its own transaction.
 * If a new image URL differs from the old one, deletes the old image file after the commit.
 */
export const update = (
    product: ProductDocument,
    data: ProductUpdateData
): Promise<ProductDocument> =>
    withTransaction((session) => applyUpdate(product, data, session)).then(finishUpdate);

/**
 * Fetches a product by id and updates it — inside the caller's transaction; a miss is a 404.
 * A flip to inactive writes `PRODUCT_DEACTIVATED` to the outbox in the same transaction.
 *
 * @param id - the product
 * @param data - the changes
 * @param session - the transaction the save and the event join
 * @returns what to finish after the commit, or the 404
 */
export const updateByIdInTransaction = (
    id: string,
    data: ProductUpdateData,
    session: ClientSession
): Promise<ProductUpdateOutcome | ResponseReject> => {
    // `withTransaction` may re-run this on a conflict: each attempt checks the caller's `If-Match`
    // against the row it loads, instead of the first attempt's having used it up.
    rearmPrecondition();

    return productRepository.findById(id).then((product) => {
        // Returned, not thrown: a thrown miss is indistinguishable from a genuine database error
        // at the `.catch()` that has to tell them apart.
        if (!product) return generateReject(404, [t('products.not-found')]);

        // Read before `applyUpdate` mutates `product.active` in place — the flip is the whole
        // signal `PRODUCT_DEACTIVATED` exists to report, same shape `users`' ban/unban audit uses.
        const wasActive = product.active;

        return applyUpdate(product, data, session).then((outcome) =>
            wasActive !== false && outcome.updated.active === false
                ? enqueueOutboxEvent(PRODUCT_DEACTIVATED, { productId: id }, id, session).then(
                      () => outcome
                  )
                : outcome
        );
    });
};

/**
 * Everything an update-by-id does after its transaction has committed: the audit entry, then
 * {@link finishUpdate}.
 *
 * @param id - the product
 * @param outcome - what the transaction saved
 * @param context - the caller, for the audit entry
 */
export const finishUpdateById = (
    id: string,
    outcome: ProductUpdateOutcome,
    context: CallerContext
): Promise<ResponseSuccess<ProductDocument>> =>
    afterCommitStep('audit', () =>
        recordAudit(context, {
            action: productsAuditActions.ADMIN_PRODUCT_UPDATED,
            outcome: 'success',
            target_type: 'product',
            target_id: id
        })
    )
        .then(() => finishUpdate(outcome))
        .then((updated) => generateSuccess(updated));

/**
 * Update an existing product by ID, in its own transaction.
 * Fetches the document then applies the changes — see {@link updateByIdInTransaction}.
 */
export const updateById = (
    id: string,
    data: ProductUpdateData,
    context: CallerContext
): Promise<ResponseSuccess<ProductDocument> | ResponseReject> =>
    withTransaction((session) => updateByIdInTransaction(id, data, session)).then(
        (result): Promise<ResponseSuccess<ProductDocument> | ResponseReject> =>
            'updated' in result ? finishUpdateById(id, result, context) : Promise.resolve(result)
    );
