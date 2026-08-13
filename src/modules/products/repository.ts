import { productModel, applyProductTransform } from './model';
import type { IProductDocument } from './model';
import {
    createBaseRepository,
    toObjectId,
    type IBaseRepository
} from '@infrastructure/persistence/base-repository';

/**
 * Product Repository
 * Standard CRUD via the base factory, plus the catalogue's own query rules.
 *
 * The type is written out because Mongoose's generics are too large for TypeScript to serialize
 * an inferred one at an export boundary (TS7056) — the same reason `IBaseRepository` exists.
 */
/** One facet value with its count, as the aggregation returns it. */
export interface IFacetCount {
    name: string;
    count: number;
}

export const productRepository: IBaseRepository<IProductDocument> & {
    publicScope: () => Record<string, unknown>;
    facets: () => Promise<{ categories: IFacetCount[]; tags: IFacetCount[] }>;
    decrementStock: (productId: string, quantity: number) => Promise<boolean>;
    incrementStock: (productId: string, quantity: number) => Promise<void>;
} = {
    ...createBaseRepository<IProductDocument>(productModel, {
        transform: applyProductTransform,
        searchable: {
            objectIds: { id: '_id' },
            text: ['title', 'description'],
            arrayRegex: { category: 'categories', tag: 'tags' },
            ranges: { price: { min: 'minPrice', max: 'maxPrice' } }
        }
    }),

    /**
     * What a non-admin caller is allowed to see: published, not soft-deleted.
     *
     * Lives here rather than in the service because it is a rule about which *rows* exist for a
     * given audience — spread it into any filter (`{ ...publicScope(), price: … }`). Admin
     * callers pass nothing, which is how they see inactive and soft-deleted rows.
     */
    publicScope: (): Record<string, unknown> => ({
        active: true,
        deletedAt: { $exists: false }
    }),

    /**
     * Every category and tag the PUBLIC catalogue carries, counted.
     *
     * One `$facet` pipeline rather than two aggregations, so both lists are counted against the
     * same snapshot of the collection — two round trips could disagree with each other about a
     * product written in between. The `$match` is `publicScope()` for the reason the contract
     * states: a category held only by hidden products would render as a filter chip that finds
     * nothing.
     */
    facets: () =>
        productModel
            .aggregate<{
                categories: { _id: string; count: number }[];
                tags: { _id: string; count: number }[];
            }>([
                { $match: { active: true, deletedAt: { $exists: false } } },
                {
                    $facet: {
                        categories: [
                            { $unwind: '$categories' },
                            { $group: { _id: '$categories', count: { $sum: 1 } } },
                            { $sort: { count: -1, _id: 1 } }
                        ],
                        tags: [
                            { $unwind: '$tags' },
                            { $group: { _id: '$tags', count: { $sum: 1 } } },
                            { $sort: { count: -1, _id: 1 } }
                        ]
                    }
                }
            ])
            .then(([result]) => ({
                categories: (result?.categories ?? []).map(({ _id, count }) => ({
                    name: _id,
                    count
                })),
                tags: (result?.tags ?? []).map(({ _id, count }) => ({ name: _id, count }))
            })),

    /**
     * Take `quantity` units off the shelf — atomically, or not at all.
     *
     * The `stock: { $gte: quantity }` condition rides IN the filter, so mongod evaluates it
     * while holding the document: two checkouts racing over the last unit cannot both read
     * "one left" and both decrement, which is the overselling race a read-then-write opens.
     * `false` — the filter matched nothing — is the caller's 409.
     *
     * `timestamps: false`: a sale is not an edit to the product; `updatedAt` keeps meaning
     * "the catalogue entry changed", which is what cache keys and admin listings read it as.
     */
    decrementStock: (productId: string, quantity: number) =>
        productModel
            .updateOne(
                { _id: toObjectId(productId), stock: { $gte: quantity } },
                { $inc: { stock: -quantity } },
                { timestamps: false }
            )
            .exec()
            .then(({ modifiedCount }) => modifiedCount > 0),

    /**
     * Put units back — a cancelled order, or the rollback half of a checkout that decremented
     * some lines and then failed one. Unconditional: there is no ceiling to respect, and a
     * product deleted in between simply matches nothing.
     */
    incrementStock: (productId: string, quantity: number) =>
        productModel
            .updateOne(
                { _id: toObjectId(productId) },
                { $inc: { stock: quantity } },
                { timestamps: false }
            )
            .exec()
            .then(() => {
                // explicit void return
            })
};
