/**
 * @module
 * Product repository: standard CRUD via the repository factory, plus the catalogue's own query
 * rules and the stock-cache mirror `@modules/inventory` writes through. The exported type is
 * written out because Mongoose's generics are too large for TypeScript to serialize an inferred
 * one at an export boundary (TS7056) — the same reason `Repository` exists.
 */

import type { FacetCount, Product } from '@types';
import { productModel, applyProductTransform } from './model';
import type { ProductDocument } from './model';
import {
    createRepository,
    toObjectId,
    type Repository
} from '@infrastructure/persistence/create-repository';
import type { ImageWriteback } from '@infrastructure/adapters/image.worker';

/**
 * What a non-admin caller is allowed to see: published, not soft-deleted — spread into any filter;
 * admin callers pass nothing and see everything.
 *
 * A `const` above the literal because three members below need it; reading it back off
 * `productRepository` only works through lazy property resolution.
 */
const PUBLIC_SCOPE: Readonly<Record<string, unknown>> = {
    active: true,
    deletedAt: { $exists: false }
};

/** The catalogue's repository: base CRUD from the factory, extended with scoping, facets, and the stock-cache mirror. */
export const productRepository: Repository<ProductDocument, Product> & {
    publicScope: () => Record<string, unknown>;
    findByIdScoped: (
        productId: string,
        scope?: Record<string, unknown>
    ) => Promise<ProductDocument | null>;
    findPublicById: (productId: string) => Promise<ProductDocument | null>;
    facets: () => Promise<{ categories: FacetCount[]; tags: FacetCount[] }>;
    syncStockCache: (
        productId: string,
        counters: { onHand: number; reserved: number }
    ) => Promise<void>;
    writebackImage: ImageWriteback;
} = {
    ...createRepository<ProductDocument, Product>(productModel, {
        transform: applyProductTransform,
        searchable: {
            objectIds: { id: '_id' },
            text: ['title', 'description'],
            arrayRegex: { category: 'categories', tag: 'tags' },
            // `title` searches the same column the public catalogue already exposes.
            regex: { title: 'title' },
            /*
             * Admin-effective: a stranger's visibility scope pins `active: true`, so the two
             * clauses contradict and the page is empty rather than listing the unlisted catalogue.
             */
            booleans: { active: 'active' },
            ranges: { price: { min: 'minPrice', max: 'maxPrice' } }
        }
    }),

    /** The published spelling of {@link PUBLIC_SCOPE}, for callers outside this file. */
    publicScope: (): Record<string, unknown> => ({ ...PUBLIC_SCOPE }),

    /**
     * Fetch one product, optionally narrowed to a caller's authorization scope.
     *
     * The id lookup and the scope are applied by the same query — checking visibility after the read
     * is how a scoped find turns into an information leak. No scope means no restriction, the admin
     * branch (see `accessibleFilter`). `async` because `toObjectId` throws on a malformed id —
     * see `create-repository.ts`; `orders.findByIdScoped` is the same idea.
     *
     * @param productId - the product's id
     * @param scope - the caller's filter fragment, or `undefined` to read unrestricted
     * @returns the product if it matches the scope, otherwise `null`
     */
    findByIdScoped: async (productId: string, scope?: Record<string, unknown>) =>
        productRepository.findOne({ _id: toObjectId(productId), ...scope }),

    /**
     * The publicly visible product with this id, or `null` — {@link findByIdScoped} bound to the
     * public scope, used by `cart/services/reorder.ts` and `wishlist/service.ts`.
     *
     * @param productId - the product's id
     * @returns the product if it is published and not soft-deleted, otherwise `null`
     */
    findPublicById: (productId: string) =>
        productRepository.findByIdScoped(productId, PUBLIC_SCOPE),

    /**
     * Every category and tag the PUBLIC catalogue carries, counted.
     *
     * One `$facet` pipeline rather than two, so both lists count against the same snapshot — two
     * round trips could disagree about a product written in between. `$match` reuses `PUBLIC_SCOPE`
     * itself, so a category held only by hidden products can't render as a chip that finds nothing.
     */
    facets: () =>
        productModel
            .aggregate<{
                categories: { _id: string; count: number }[];
                tags: { _id: string; count: number }[];
            }>([
                { $match: { ...PUBLIC_SCOPE } },
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
            .then((results) => ({
                categories: (results.at(0)?.categories ?? []).map(({ _id, count }) => ({
                    name: _id,
                    count
                })),
                tags: (results.at(0)?.tags ?? []).map(({ _id, count }) => ({ name: _id, count }))
            })),

    /**
     * Mirror `@modules/inventory`'s stock level onto this document — an unconditional `$set`, never
     * guarded, because this write does not decide anything: `@modules/inventory` already decided,
     * this only copies the answer. `timestamps: false` — a stock change isn't an edit an admin made.
     *
     * @param productId - the product
     * @param counters - the values to write, verbatim
     */
    syncStockCache: (productId: string, counters: { onHand: number; reserved: number }) =>
        productModel
            .updateOne({ _id: toObjectId(productId) }, { $set: counters }, { timestamps: false })
            .exec()
            .then(() => undefined),

    /**
     * The image digest pipeline's writeback for the `products` collection — see `ImageTarget` in
     * `kernel/registry.ts`. Conditional on `pendingImageKey` still matching `key`, so a stale or
     * duplicate job delivery cannot overwrite a later upload, and a hard-deleted product is a
     * detectable miss rather than a write to nothing.
     *
     * `timestamps: false` — the digest finishing is not an edit an admin made.
     */
    writebackImage: (documentId, key, urls) =>
        productModel
            .updateOne(
                { _id: toObjectId(documentId), pendingImageKey: key },
                {
                    $set: { imageUrl: urls.imageUrl, thumbnailUrl: urls.thumbnailUrl },
                    $unset: { pendingImageKey: '' }
                },
                { timestamps: false }
            )
            .exec()
            .then(({ matchedCount }) => matchedCount > 0)
};
