import { orderModel, applyOrderTransform } from '@models/orders';
import type { IOrderDocument } from '@models/orders';
import type { PipelineStage } from 'mongoose';
import {
    createBaseRepository,
    toObjectId,
    type TSearchFilters,
    type IBaseRepository
} from './base';
import { normalizePagination, buildPaginatedMeta, type IPaginatedMeta } from './search';

/**
 * Order Repository
 *
 * Unlike the other collections, orders are read through the aggregation framework: an order
 * embeds a product snapshot, and filtering on `items.product._id` is a pipeline concern. The
 * base factory still supplies plain CRUD; search is overridden below.
 */
const base = createBaseRepository<IOrderDocument>(orderModel, {
    transform: applyOrderTransform,
    searchable: {
        objectIds: {
            id: '_id',
            userId: 'userId',
            // Product data is embedded, not referenced — the snapshot's own `_id` is what
            // identifies which product an order line holds.
            productId: 'items.product._id'
        },
        exact: { email: 'email' }
    }
});

/**
 * Run an aggregation pipeline against the Order collection.
 */
const aggregate = <T = IOrderDocument>(pipeline: PipelineStage[]): Promise<T[]> =>
    orderModel.aggregate<T>(pipeline);

/**
 * Filter → count → page → normalize, over the aggregation framework.
 *
 * The `$match` is built from the same declared spec the other repositories use, so id coercion
 * stays in one place. `$match` does NOT cast the way `find()` does, which is exactly why the
 * coercion has to happen before the pipeline is assembled.
 *
 * `async` for the same reason as the base factory's `search`: `buildWhere` runs synchronously and
 * can throw on a malformed id, and a function typed `Promise<T>` must reject rather than throw —
 * otherwise the caller's `.catch()` is bypassed and the client gets a 500 instead of a 422.
 */
const search = async (
    filters: TSearchFilters = {},
    scope: Record<string, unknown> = {}
): Promise<{ items: IOrderDocument[]; meta: IPaginatedMeta }> => {
    const pagination = normalizePagination(filters);
    // Scope merged last: it is the authorization boundary, and no client filter may widen it.
    const match = { ...base.buildWhere(filters), ...scope };

    const basePipeline: PipelineStage[] = [{ $match: match }, { $sort: { createdAt: -1 } }];

    return aggregate<{ totalItems?: number }>([...basePipeline, { $count: 'totalItems' }]).then(
        ([countResult]) => {
            const totalItems = countResult?.totalItems ?? 0;

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
 * Fetch one order, optionally restricted to a caller's own rows.
 *
 * Goes through the pipeline rather than `findById` so the `_id` lookup and the authorization
 * scope are applied by the same query — checking ownership after the read is how a scoped find
 * turns into an information leak.
 */
const findByIdScoped = (
    id: string,
    scope?: Record<string, unknown>
): Promise<IOrderDocument | undefined> => {
    if (!scope) return base.findById(id).then((order) => order ?? undefined);

    return aggregate([{ $match: { _id: toObjectId(id), ...scope } }, { $limit: 1 }]).then(
        ([result]) => (result ? base.normalize([result])[0] : undefined)
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
 * What a non-admin caller is allowed to see: their own orders, not soft-deleted.
 *
 * The counterpart of `publicScope` in @repositories/products, and it lives here for the same
 * reason — it is a rule about which *rows* exist for a given audience, not about a request.
 *
 * Two axes, deliberately composed rather than merged: `ownerScope` answers "whose", the
 * `deletedAt` clause answers "still there". An admin passes no scope at all, which is how they
 * read both other people's orders and soft-deleted ones.
 *
 * `$exists: false` rather than `null`: `remove` unsets the field to restore, so a restored order
 * has no `deletedAt` key rather than a null one.
 */
const visibleScope = (userId: string): Record<string, unknown> => ({
    ...ownerScope(userId),
    deletedAt: { $exists: false }
});

/**
 * `search` is narrower than the base signature (no caller-supplied sort — the pipeline fixes it),
 * so it is omitted from the base contract rather than intersected with it.
 *
 * The type is written out because Mongoose's generics are too large for TypeScript to serialize
 * an inferred one at an export boundary (TS7056).
 */
export const orderRepository: Omit<IBaseRepository<IOrderDocument>, 'search'> & {
    aggregate: <T = IOrderDocument>(pipeline: PipelineStage[]) => Promise<T[]>;
    search: (
        filters?: TSearchFilters,
        scope?: Record<string, unknown>
    ) => Promise<{ items: IOrderDocument[]; meta: IPaginatedMeta }>;
    findByIdScoped: (
        id: string,
        scope?: Record<string, unknown>
    ) => Promise<IOrderDocument | undefined>;
    ownerScope: (userId: string) => Record<string, unknown>;
    visibleScope: (userId: string) => Record<string, unknown>;
} = {
    ...base,
    aggregate,
    search,
    findByIdScoped,
    ownerScope,
    visibleScope
};
