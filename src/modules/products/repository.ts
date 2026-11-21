/**
 * @module
 * Product repository: standard CRUD via the repository factory, plus the catalogue's own query
 * rules. The exported type is written out because Mongoose's generics are too large for TypeScript
 * to serialize an inferred one at an export boundary (TS7056) — the same reason `Repository` exists.
 */

import type { FacetCount, Product } from '@types';
import { productModel, applyProductTransform } from './model';
import type { ProductDocument } from './model';
import {
    createRepository,
    toObjectId,
    type Lean,
    type Repository
} from '@infrastructure/persistence/create-repository';
import type { ImageWriteback } from '@infrastructure/adapters/image.worker';
import { imageWritebackFor } from '@infrastructure/persistence/image-writeback';
import {
    translatableColumnsOf,
    type TranslatableColumns
} from '@infrastructure/persistence/translatable-columns';

/**
 * What a non-admin caller is allowed to see: published, not soft-deleted — spread into any filter;
 * admin callers pass nothing and see everything.
 *
 * A `const` above the literal because three members below need it; reading it back off
 * `productRepository` only works through lazy property resolution.
 */
const PUBLIC_SCOPE: Readonly<Record<string, unknown>> = {
    active: true,
    /** `null` matches a missing field too, and is how the permission rules spell it. */
    deletedAt: null
};

/** What a sitemap needs of a public product: where it lives and when its content last changed. */
export interface ListedProduct {
    /** The product's id, as the path segment of its page. */
    id: string;
    /** When the product, or a translation of it, last changed; absent only on a row no write has touched. */
    updatedAt?: Date;
}

/** The catalogue's repository: base CRUD from the factory, extended with scoping and facets. */
export const productRepository: Repository<ProductDocument, Product> & {
    publicScope: () => Record<string, unknown>;
    findByIdScoped: (
        productId: string,
        scope?: Record<string, unknown>
    ) => Promise<ProductDocument | null>;
    findPublicById: (productId: string) => Promise<ProductDocument | null>;
    findByIdRawScoped: (
        productId: string,
        scope: Record<string, unknown>
    ) => Promise<Lean<ProductDocument> | null>;
    facets: () => Promise<{ categories: FacetCount[]; tags: FacetCount[] }>;
    listedPage: (skip: number, limit: number) => Promise<ListedProduct[]>;
    translatable: TranslatableColumns;
    writebackImage: ImageWriteback;
} = {
    ...createRepository<ProductDocument, Product>(productModel, {
        transform: applyProductTransform,
        searchable: {
            objectIds: { id: '_id' },
            text: ['title', 'description'],
            arrayRegex: { category: 'categories', tag: 'tags' },
            /** `title` searches the column the public catalogue exposes. */
            regex: { title: 'title' },
            /**
             * Admin-effective: a stranger's visibility scope pins `active: true`, so the two
             * clauses contradict and the page is empty rather than listing the unlisted catalogue.
             */
            booleans: { active: 'active', purchasable: 'purchasable' },
            presence: { deleted: 'deletedAt' },
            ranges: { price: { min: 'priceMin', max: 'priceMax' } },
            /** `title` is the fallback-locale column the public catalogue exposes. */
            sortable: { createdAt: 'createdAt', price: 'price', title: 'title' }
        }
    }),

    /** The published spelling of {@link PUBLIC_SCOPE}, for callers outside this file. */
    publicScope: (): Record<string, unknown> => ({ ...PUBLIC_SCOPE }),

    /**
     * Fetch one product, optionally narrowed to a caller's authorization scope.
     *
     * The id lookup and the scope are applied by the same query — checking visibility after the
     * read is how a scoped find turns into an information leak. No scope means no restriction, the
     * admin branch (see `accessibleFilter`). `async` because `toObjectId` throws on a malformed id
     * — see `create-repository.ts`; `orders.findByIdScoped` is the same idea.
     *
     * @param scope - the caller's filter fragment, or `undefined` to read unrestricted
     * @returns the product if it matches the scope, otherwise `null`
     */
    findByIdScoped: async (productId: string, scope?: Record<string, unknown>) =>
        productRepository.findOne({ _id: toObjectId(productId), ...scope }),

    /**
     * One product as a plain, untransformed object, narrowed to a caller's scope by the same query
     * that finds it — {@link findByIdScoped} for a reader that embeds a snapshot (an order line).
     * `async` because `toObjectId` throws on a malformed id.
     *
     * @param scope - the caller's filter fragment (`{}` reads everything, the admin branch)
     * @returns the product if it matches the scope, otherwise `null`
     */
    findByIdRawScoped: async (productId: string, scope: Record<string, unknown>) =>
        productModel
            .findOne({ _id: toObjectId(productId), ...scope })
            .lean<Lean<ProductDocument> | null>()
            .exec(),

    /**
     * The publicly visible product with this id, or `null` — {@link findByIdScoped} bound to the
     * public scope, used by `wishlist/service.ts`.
     *
     * @returns the product if it is published and not soft-deleted, otherwise `null`
     */
    findPublicById: (productId: string) =>
        productRepository.findByIdScoped(productId, PUBLIC_SCOPE),

    /**
     * One page of the public catalogue, oldest id first, as nothing but id and `updatedAt`.
     *
     * Skip/limit over the `_id` index: the order is stable while the catalogue grows at the end,
     * and the two-field projection keeps a 50,000-row page small.
     *
     * @param skip - how many public products come before the page
     * @param limit - the page size
     */
    listedPage: (skip: number, limit: number): Promise<ListedProduct[]> =>
        productModel
            .find(PUBLIC_SCOPE)
            .select({ updatedAt: 1 })
            .sort({ _id: 1 })
            .skip(skip)
            .limit(limit)
            .lean()
            .exec()
            .then((rows) => rows.map((row) => ({ id: String(row._id), updatedAt: row.updatedAt }))),

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

    translatable: translatableColumnsOf(productModel),

    /**
     * The image digest pipeline's writeback for the `products` collection — see `ImageTarget` in
     * `kernel/registry.ts`. Conditional on `pendingImageKey` still matching `key`, so a stale or
     * duplicate job delivery cannot overwrite a later upload, and a hard-deleted product is a
     * detectable miss rather than a write to nothing.
     *
     * `timestamps: false` — the digest finishing is not an edit an admin made.
     */
    writebackImage: imageWritebackFor(productModel)
};
