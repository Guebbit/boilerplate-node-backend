/**
 * @module
 * Order repository. Unlike the other collections, orders are read through the aggregation
 * framework: an order embeds a product snapshot, and filtering on `items.product._id` is a
 * pipeline concern. The repository factory still supplies plain CRUD; search is overridden
 * below.
 */

import { orderModel, applyOrderTransform } from './model';
import type { OrderDocument } from './model';
import type { PipelineStage } from 'mongoose';
import {
    createRepository,
    toObjectId,
    type SearchFilters,
    type Repository
} from '@infrastructure/persistence/create-repository';
import {
    normalizePagination,
    buildPaginatedMeta,
    DEFAULT_SORT,
    type PaginatedMeta
} from '@infrastructure/persistence/search';

/** Plain CRUD from the repository factory; `search` below overrides its aggregation-free default. */
const base = createRepository<OrderDocument>(orderModel, {
    transform: applyOrderTransform,
    searchable: {
        objectIds: {
            id: '_id',
            userId: 'userId',
            // Product data is embedded, not referenced — the snapshot's own `_id` is what
            // identifies which product an order line holds.
            productId: 'items.product._id'
        },
        exact: { email: 'email', status: 'status' },
        // Staff-written text on the order, so the filter is only reachable by someone who sees it.
        regex: { notes: 'notes' }
    }
});

/**
 * Run an aggregation pipeline against the Order collection.
 */
const aggregate = <T = OrderDocument>(pipeline: PipelineStage[]): Promise<T[]> =>
    orderModel.aggregate<T>(pipeline);

/**
 * Filter → count → page → normalize, over the aggregation framework. `$match` is built from the
 * same declared spec the other repositories use, so id coercion happens before the pipeline is
 * assembled — unlike `find()`, `$match` doesn't cast. `async` so `buildWhere`'s synchronous
 * throw on a malformed id becomes a rejection, not a thrown error that bypasses the caller's
 * `.catch()`.
 */
const search = async (
    filters: SearchFilters = {},
    scope: Record<string, unknown> = {}
): Promise<{ items: OrderDocument[]; meta: PaginatedMeta }> => {
    const pagination = normalizePagination(filters);
    // Scope merged last: it is the authorization boundary, and no client filter may widen it.
    const match = { ...base.buildWhere(filters), ...scope };

    // `DEFAULT_SORT`, not a bare `createdAt` — the count and the page below are two separate
    // `aggregate()` calls, so a tie between them puts one order on page 1 AND page 2 and skips
    // another. Orders arrive in bursts (a seed, a bulk import, two concurrent checkouts), which
    // makes ties the normal case rather than the edge one.
    const basePipeline: PipelineStage[] = [{ $match: match }, { $sort: DEFAULT_SORT }];

    return aggregate<{ totalItems?: number }>([...basePipeline, { $count: 'totalItems' }]).then(
        (countResults) => {
            const totalItems = countResults.at(0)?.totalItems ?? 0;

            return aggregate([
                ...basePipeline,
                { $skip: pagination.skip },
                { $limit: pagination.pageSize }
            ]).then((items) => ({
                items: base.normalize(items),
                meta: buildPaginatedMeta(pagination, totalItems)
            }));
        }
    );
};

/**
 * Fetch one order, optionally restricted to a caller's own rows. Goes through the pipeline
 * rather than `findById` so the lookup and the authorization scope apply in the same query —
 * checking ownership after the read is how a scoped find becomes an information leak. The
 * return is polymorphic: unscoped (admin) resolves a hydrated Mongoose document, scoped (owner)
 * resolves a plain object already through `applyOrderTransform` — both serialize identically,
 * but only `id` resolves on both. `_id` type-checks on `OrderDocument` yet is `undefined` for
 * non-admins at runtime, silently and unchecked by TypeScript — the invoice filename shipped
 * that bug once already.
 */
const findByIdScoped = (
    id: string,
    scope?: Record<string, unknown>
): Promise<OrderDocument | undefined> => {
    if (!scope) return base.findById(id).then((order) => order ?? undefined);

    return aggregate([{ $match: { _id: toObjectId(id), ...scope } }, { $limit: 1 }]).then(
        (results) => {
            const result = results.at(0);
            return result ? base.normalize([result])[0] : undefined;
        }
    );
};

/**
 * Restrict a query to one user's own orders.
 *
 * The `userId` on an order is an ObjectId, so the caller's id has to be coerced before it can
 * match — a raw string silently matches nothing inside a `$match`, which reads as "this user has
 * no orders" rather than as a mistake.
 */
const ownerScope = (userId: string): Record<string, unknown> => ({
    userId: toObjectId(userId)
});

/**
 * What a non-admin caller is allowed to see: their own orders, not soft-deleted — the
 * counterpart of `publicScope` in `@modules/products`, a rule about which *rows* exist for an
 * audience. Two axes, composed rather than merged: `ownerScope` answers "whose", `deletedAt`
 * answers "still there"; an admin passes no scope, which is how they read other people's orders
 * and soft-deleted ones. `$exists: false` not `null`: `remove` unsets the field to restore, so a
 * restored order has no `deletedAt` key.
 */
const visibleScope = (userId: string): Record<string, unknown> => ({
    ...ownerScope(userId),
    deletedAt: { $exists: false }
});

/**
 * Move an order between statuses, but only from one of the expected ones — atomically. The
 * condition rides IN THE FILTER, not a preceding read: two requests racing an order (a customer
 * cancelling while admin marks it shipped) must not both read `pending` and both write. mongod
 * evaluates the filter while holding the document, so exactly one matches; the loser gets `null`
 * and a follow-up read only informs the error message. The scope composes the same way:
 * `visibleScope` rides in the same filter, so there's no window between an ownership check and
 * the write.
 */
const updateStatusIfIn = (
    id: string,
    from: readonly string[],
    to: string,
    scope?: Record<string, unknown>
): Promise<OrderDocument | null> =>
    orderModel
        .findOneAndUpdate(
            { _id: toObjectId(id), ...scope, status: { $in: [...from] } },
            { $set: { status: to } },
            { returnDocument: 'after' }
        )
        .exec();

/**
 * Unset `userId` on every order this account placed, and mark them for `scripts/reap-orders.ts`
 * to scrub later — `users`' `USER_DELETED` listener. The order row is never touched otherwise:
 * it is the invoice, kept whole until `anonymizeAfter`.
 *
 * @param userId - the erased account's id
 * @param anonymizeAfter - when the reaper may scrub this order's remaining PII
 * @returns how many orders were detached
 */
const detachUserId = (userId: string, anonymizeAfter: Date): Promise<number> =>
    orderModel
        .updateMany(
            { userId: toObjectId(userId) },
            { $unset: { userId: 1 }, $set: { anonymizeAfter } },
            { timestamps: false }
        )
        .exec()
        .then(({ modifiedCount }) => modifiedCount);

/** The scrubbed-in-place values `scrubDueForAnonymization` replaces required PII with. */
const ANONYMIZED_EMAIL = 'anonymized@deleted.invalid';

/** Same placeholder for `shippingAddress.fullName` and `.street` — both required on the schema. */
const ANONYMIZED_TEXT = 'Anonymized';

/**
 * `scripts/reap-orders.ts`'s sweep. Every order whose `anonymizeAfter` has
 * elapsed gets its remaining PII scrubbed: `email` and the required `shippingAddress` fields
 * (`fullName`, `street`) are REPLACED, since the schema requires them; the optional
 * `shippingAddress.phone` is unset outright. City, country, zip, amounts, line items and dates
 * survive — they are no longer personal data once the name and street are gone.
 *
 * Two writes, not one: an order placed by an account that kept no address book (pickup, or a
 * guest with none) has no `shippingAddress` at all, and a single `$set` on its sub-fields would
 * CREATE a partial one — present but missing the required `city`/`zip`/`country` no validator
 * runs on a bulk update to catch. The second write is scoped to orders that actually have one.
 *
 * `anonymizeAfter` is unset in the same write, which is what stops a later run rescrubbing an
 * already-scrubbed row: the sparse index this field carries no longer holds it, so the next
 * sweep's `$lte` filter cannot match it again.
 *
 * @param cutoff - orders whose `anonymizeAfter` is at or before this instant are due
 * @returns how many orders were scrubbed
 */
const scrubDueForAnonymization = (cutoff: Date): Promise<number> => {
    const due = { anonymizeAfter: { $lte: cutoff } };

    // Shipping address FIRST, filtered on `due` while `anonymizeAfter` still carries it — the
    // second write below unsets that field, which would make this filter match nothing run
    // the other way around.
    return orderModel
        .updateMany(
            { ...due, shippingAddress: { $exists: true } },
            {
                $set: {
                    'shippingAddress.fullName': ANONYMIZED_TEXT,
                    'shippingAddress.street': ANONYMIZED_TEXT
                },
                $unset: { 'shippingAddress.phone': 1 }
            },
            { timestamps: false }
        )
        .exec()
        .then(() =>
            orderModel
                .updateMany(
                    due,
                    { $set: { email: ANONYMIZED_EMAIL }, $unset: { anonymizeAfter: 1 } },
                    { timestamps: false }
                )
                .exec()
                .then(({ modifiedCount }) => modifiedCount)
        );
};

/**
 * `search` is narrower than the base signature (no caller-supplied sort — the pipeline fixes it),
 * so it is omitted from the base contract rather than intersected with it.
 *
 * The type is written out because Mongoose's generics are too large for TypeScript to serialize
 * an inferred one at an export boundary (TS7056).
 */
export const orderRepository: Omit<Repository<OrderDocument>, 'search'> & {
    aggregate: <T = OrderDocument>(pipeline: PipelineStage[]) => Promise<T[]>;
    search: (
        filters?: SearchFilters,
        scope?: Record<string, unknown>
    ) => Promise<{ items: OrderDocument[]; meta: PaginatedMeta }>;
    findByIdScoped: (
        id: string,
        scope?: Record<string, unknown>
    ) => Promise<OrderDocument | undefined>;
    ownerScope: (userId: string) => Record<string, unknown>;
    visibleScope: (userId: string) => Record<string, unknown>;
    updateStatusIfIn: (
        id: string,
        from: readonly string[],
        to: string,
        scope?: Record<string, unknown>
    ) => Promise<OrderDocument | null>;
    detachUserId: (userId: string, anonymizeAfter: Date) => Promise<number>;
    scrubDueForAnonymization: (cutoff: Date) => Promise<number>;
} = {
    ...base,
    aggregate,
    search,
    findByIdScoped,
    ownerScope,
    visibleScope,
    updateStatusIfIn,
    detachUserId,
    scrubDueForAnonymization
};
