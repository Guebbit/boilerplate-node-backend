/**
 * @module
 * The transaction steps of a product write: what the document holds and what each write announces.
 * `./translated-write` composes them into the create and update doors.
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
import { afterCommit } from '@infrastructure/runtime/after-commit';
import { recordAudit } from '@infrastructure/observability/audit';
import { productsAuditActions } from '../audit';
import {
    PRODUCT_BUYABLE_AGAIN,
    PRODUCT_CREATED,
    PRODUCT_RELEASE_DATE_CHANGED,
    PRODUCT_RESTOCK_DATE_CHANGED
} from '../events';
import type { ProductDocument } from '../model';
import { productRepository } from '../repository';
import { sanitizeStringArray } from './validation';
import { isBuyable } from '../domain/buyable';
import { enqueueIfImagePending } from '@infrastructure/adapters/image.worker';

/** What `insertProduct` accepts: the product's fields, plus the pending-image placeholder's key. */
type ProductCreateData = Omit<
    Product,
    | 'id'
    | 'currency'
    | 'inStock'
    | 'lowStock'
    | 'preorder'
    | 'backorder'
    | 'onHand'
    | 'releaseDate'
    | 'restockDate'
    | 'createdAt'
    | 'updatedAt'
    | 'deletedAt'
> & {
    /** ISO date-time the product ships from; a future one makes it a preorder. */
    releaseDate?: string;
    /** ISO date-time stock is expected back, for a product that allows backorder. */
    restockDate?: string;
    /** Set alongside the pending-image placeholder — see `readUploadedImage`. */
    pendingImageKey?: string;
};

/**
 * What `applyUpdate` accepts.
 *
 * `imageUrl`/`weight`/`taxClass`/`rateType`/`sku`/`releaseDate` are widened to accept `null`, since the domain
 * type `Product` states them as a real value or absent-means-zero/standard/unset, never
 * explicitly cleared. `imageUrl: null` unsets the image; `weight`/`taxClass`/`rateType`/`sku: null`
 * genuinely unset them.
 */
type ProductUpdateData = Partial<
    Omit<
        Product,
        | 'id'
        | 'imageUrl'
        | 'weight'
        | 'taxClass'
        | 'rateType'
        | 'sku'
        | 'releaseDate'
        | 'restockDate'
    >
> & {
    /** Set alongside a new pending-image placeholder — see `readUploadedImage`. */
    pendingImageKey?: string;
    imageUrl?: string | null;
    weight?: number | null;
    taxClass?: TaxClass | null;
    rateType?: RateType | null;
    sku?: string | null;
    /** ISO date-time; `null` clears it, so the product is no longer a preorder. */
    releaseDate?: string | null;
    /** ISO date-time; `null` clears it, so the product promises "within 30 days". */
    restockDate?: string | null;
    /**
     * The edit also wrote something OUTSIDE this document (translation rows). Moves
     * `updatedAt` so the row's version — its `ETag` — moves with the edit.
     */
    touch?: boolean;
};

/**
 * Hand a pending image to the queue after the commit; a failure is logged and the saved product
 * answered. `pendingImageKey` means the queue looked ready at upload time (the no-broker path
 * resolves inline before saving, see `readUploadedImage`) — see {@link enqueueIfImagePending} for
 * what happens with it.
 *
 * @param product - the saved product
 */
const enqueuePendingImage = (product: ProductDocument): Promise<ProductDocument> =>
    afterCommit(
        'image enqueue',
        () => enqueueIfImagePending(product, 'products', productRepository.writebackImage),
        product,
        { productId: String(product._id) }
    );

/**
 * `data` without its two dates, which the write converts to `Date`s itself.
 * @param data - the create body
 */
const withoutDates = ({
    releaseDate: _releaseDate,
    restockDate: _restockDate,
    ...rest
}: ProductCreateData): Omit<ProductCreateData, 'releaseDate' | 'restockDate'> => rest;

/**
 * Writes a product row and announces it — inside the caller's transaction.
 *
 * Written with `onHand: 0` — this module never moves that counter (see `./model`'s own
 * docblock). `PRODUCT_CREATED` is how the product gets its stock level: `inventory` (which already
 * imports this module, so this cannot import back) is the one subscriber, and opens the level at
 * zero. The event goes through the outbox, so it exists exactly when the row does.
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
                ...withoutDates(data),
                // Mongoose casts an ISO string, but `create`'s input is typed with the stored `Date`.
                ...(data.releaseDate === undefined
                    ? {}
                    : { releaseDate: new Date(data.releaseDate) }),
                ...(data.restockDate === undefined
                    ? {}
                    : { restockDate: new Date(data.restockDate) }),
                onHand: 0,
                categories: sanitizeStringArray(data.categories),
                tags: sanitizeStringArray(data.tags)
            },
            session
        )
        .then((product) =>
            enqueueOutboxEvent(
                PRODUCT_CREATED,
                { productId: String(product._id) },
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

    return afterCommit(
        're-read',
        () => productRepository.findById(id).then((reread) => reread ?? product),
        product,
        { productId: id }
    ).then((created) =>
        afterCommit(
            'audit',
            () =>
                recordAudit(context, {
                    action: productsAuditActions.ADMIN_PRODUCT_CREATED,
                    outcome: 'success',
                    targetType: 'product',
                    targetId: id
                }),
            undefined,
            { productId: id }
        ).then(() => enqueuePendingImage(created))
    );
};

/** One field that moved: what it was and what it is now. `null` is "unset". */
interface FieldChange<TValue> {
    from: TValue | null;
    to: TValue | null;
}

/**
 * The scalar fields an update is audited for as `{ from, to }`: what a buyer pays (`price`, VAT),
 * what a basket costs to ship (`weight`, `requiresShipping`), the legal right of withdrawal
 * (`noWithdrawal`), whether the product is published or on sale, and its identity (`sku`).
 */
const AUDITED_SCALARS = [
    'price',
    'taxClass',
    'rateType',
    'active',
    'purchasable',
    'allowBackorder',
    'weight',
    'requiresShipping',
    'noWithdrawal',
    'sku'
] as const;

/** The lists audited the same way: set-like catalogue labels, compared in order. */
const AUDITED_LISTS = ['categories', 'tags'] as const;

/** Free text and the picture: audited by NAME only, so the trail never copies catalogue prose. */
const AUDITED_BY_NAME = ['title', 'description'] as const;

/** The fields an update actually moved, for the audit row. */
type ProductChanges = Partial<
    Record<
        | (typeof AUDITED_SCALARS)[number]
        | (typeof AUDITED_LISTS)[number]
        | 'releaseDate'
        | 'restockDate',
        FieldChange<unknown>
    >
>;

/** What a transactional update leaves for after the commit. */
export interface ProductUpdateOutcome {
    /** The saved document. */
    updated: ProductDocument;
    /** The image url it replaced, to delete once the commit is durable. */
    oldImageUrl: string | undefined;
    /** What moved, as `{ from, to }`; empty when nothing audited did. */
    changes: ProductChanges;
    /** The free-text fields and the image that changed, by name only. */
    changedFields: string[];
}

/**
 * Whether two values of an audited field differ, treating an unset field and `null` alike.
 *
 * @param before - the stored value
 * @param after - the requested value
 */
const differs = (before: unknown, after: unknown): boolean =>
    JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);

/**
 * The fields an update would move, with their old and new values: every non-text field, so a new
 * one is covered by default (the shape Stripe's `previous_attributes` gives). A value sent
 * unchanged, or a field left out, writes nothing.
 *
 * @param product - the fetched document, BEFORE the change is applied
 * @param data - the changes
 * @returns only the fields whose value actually differs
 */
const fieldChangesOf = (product: ProductDocument, data: ProductUpdateData): ProductChanges => {
    const changes: ProductChanges = {};
    for (const field of AUDITED_SCALARS) {
        const requested = data[field];
        if (requested !== undefined && differs(product[field], requested))
            changes[field] = { from: product[field] ?? null, to: requested };
    }
    for (const field of AUDITED_LISTS) {
        const requested = data[field];
        if (requested === undefined) continue;
        const after = sanitizeStringArray(requested);
        if (differs(product[field], after)) changes[field] = { from: product[field], to: after };
    }
    return changes;
};

/**
 * The free-text fields an update changes, by name.
 *
 * @param product - the fetched document, BEFORE the change is applied
 * @param data - the changes
 */
const changedTextOf = (product: ProductDocument, data: ProductUpdateData): string[] =>
    AUDITED_BY_NAME.filter(
        (field) => data[field] !== undefined && differs(product[field], data[field])
    );

/** What moved when one of a product's two dates did: ISO strings, absent for none. */
interface DateChange {
    from?: string;
    to?: string;
}

/**
 * Move one of a product's dates and say what moved.
 *
 * @param product - the fetched document, mutated in place
 * @param field - which date: when it ships from, or when stock is expected back
 * @param requested - the new ISO date, `null` to clear, `undefined` to leave it alone
 * @returns the `from`/`to` of an actual change, or `undefined` when the stored instant is the one
 *   asked for
 */
const applyDate = (
    product: ProductDocument,
    field: 'releaseDate' | 'restockDate',
    requested: string | null | undefined
): DateChange | undefined => {
    if (requested === undefined) return undefined;

    const from = product[field];
    const to = requested === null ? undefined : new Date(requested);
    if (from?.getTime() === to?.getTime()) return undefined;

    product[field] = clearedOrValue(to ?? null);
    return {
        ...(from ? { from: from.toISOString() } : {}),
        ...(to ? { to: to.toISOString() } : {})
    };
};

/**
 * Announce a moved date through the outbox, in the edit's own transaction.
 *
 * @param name - the event for the date that moved
 * @param change - what moved
 * @param productId - the product
 * @param session - the edit's transaction
 */
const announceDateChange = (
    name: typeof PRODUCT_RELEASE_DATE_CHANGED | typeof PRODUCT_RESTOCK_DATE_CHANGED,
    change: DateChange | undefined,
    productId: string,
    session: ClientSession
): Promise<unknown> =>
    change
        ? enqueueOutboxEvent(name, { productId, ...change }, productId, session)
        : Promise.resolve();

/**
 * Applies a change-set to a fetched product and saves it — inside the caller's transaction.
 *
 * @param product - the fetched document
 * @param data - the changes
 * @param session - the transaction the save joins
 */
const applyUpdate = (
    product: ProductDocument,
    data: ProductUpdateData,
    session: ClientSession
): Promise<ProductUpdateOutcome> => {
    // Read before the fields below overwrite what it compares against.
    const changes = fieldChangesOf(product, data);
    const changedFields = changedTextOf(product, data);
    const imageBefore = product.imageUrl;
    // What a shopper could do before the edit, to tell whether it made the product orderable.
    const wasBuyable = isBuyable(product, new Date());
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
    if (data.purchasable !== undefined) product.purchasable = data.purchasable;
    // `null` clears the date back to unset — $unset on save, same as weight/taxClass.
    const releaseDateChange = applyDate(product, 'releaseDate', data.releaseDate);
    if (releaseDateChange)
        changes.releaseDate = {
            from: releaseDateChange.from ?? null,
            to: releaseDateChange.to ?? null
        };
    if (data.allowBackorder !== undefined) product.allowBackorder = data.allowBackorder;
    // `null` clears the date back to unset ("within 30 days") — $unset on save.
    const restockDateChange = applyDate(product, 'restockDate', data.restockDate);
    if (restockDateChange)
        changes.restockDate = {
            from: restockDateChange.from ?? null,
            to: restockDateChange.to ?? null
        };
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
    if (differs(imageBefore, product.imageUrl)) changedFields.push('image');

    return productRepository
        .save(product, session)
        .then((updated) =>
            announceDateChange(
                PRODUCT_RELEASE_DATE_CHANGED,
                releaseDateChange,
                String(updated._id),
                session
            )
                .then(() =>
                    announceDateChange(
                        PRODUCT_RESTOCK_DATE_CHANGED,
                        restockDateChange,
                        String(updated._id),
                        session
                    )
                )
                .then(() =>
                    !wasBuyable && isBuyable(updated, new Date())
                        ? enqueueOutboxEvent(
                              PRODUCT_BUYABLE_AGAIN,
                              { productId: String(updated._id) },
                              String(updated._id),
                              session
                          )
                        : undefined
                )
                .then(() => updated)
        )
        .then((updated) => ({ updated, oldImageUrl, changes, changedFields }));
};

/**
 * What an update does after its transaction has committed: wake the relay, delete the replaced
 * image (and its thumbnail), hand a pending image to the queue. Each step catches its own failure.
 *
 * @param outcome - what the transaction saved
 */
const finishUpdate = (outcome: ProductUpdateOutcome): Promise<ProductDocument> => {
    nudgeOutbox();
    const { updated, oldImageUrl } = outcome;

    // `imageStore.remove` never rejects (a missing file is not a failure).
    return (oldImageUrl ? imageStore.remove(oldImageUrl) : Promise.resolve()).then(() =>
        enqueuePendingImage(updated)
    );
};

/**
 * Fetches a product by id and updates it — inside the caller's transaction; a miss is a 404.
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

    return productRepository.findById(id).then<ProductUpdateOutcome | ResponseReject>((product) => {
        // Returned, not thrown: a thrown miss is indistinguishable from a genuine database error
        // at the `.catch()` that has to tell them apart.
        if (!product) return generateReject(404, [t('products.not-found')]);

        return applyUpdate(product, data, session);
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
    afterCommit(
        'audit',
        () =>
            recordAudit(context, {
                action: productsAuditActions.ADMIN_PRODUCT_UPDATED,
                outcome: 'success',
                targetType: 'product',
                targetId: id,
                ...(Object.keys(outcome.changes).length > 0 || outcome.changedFields.length > 0
                    ? {
                          metadata: {
                              ...(Object.keys(outcome.changes).length > 0
                                  ? { changes: outcome.changes }
                                  : {}),
                              ...(outcome.changedFields.length > 0
                                  ? { changedFields: outcome.changedFields }
                                  : {})
                          }
                      }
                    : {})
            }),
        undefined,
        { productId: id }
    )
        .then(() => finishUpdate(outcome))
        .then((updated) => generateSuccess(updated));
