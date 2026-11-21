/**
 * @module
 * Catalogue search, with the caller's locale unioned in, and the public facets.
 */

import { getCurrentLocale, localeCandidatesFor } from '@infrastructure/i18n';
import { applyTranslations, previewDraftTag, searchTranslatedEntityIds } from '@kernel/translation';
import type { SearchProductsRequest, Product, FacetCount, CallerContext } from '@types';
import type { PaginatedMeta } from '@infrastructure/persistence/search';
import { toSearchPattern } from '@infrastructure/persistence/search';
import { toObjectId, withScope } from '@infrastructure/persistence/create-repository';
import { productRepository } from '../repository';
import { standingOnRead, withActions } from './actions';
import { callerScope } from './read';

/**
 * The columns a free-text search compares against — the same pair `repository.ts` declares as
 * `searchable.text`, and the ONLY fields `translatables` registers `product` for in
 * `src/modules/products/module.ts`. Kept here rather than read off the registry: this module
 * already states its own searchable columns once, and a translated search asks the same question
 * one tier down.
 */
const TRANSLATABLE_SEARCH_FIELDS = ['title', 'description'] as const;

/**
 * Search products (DTO-friendly) — matches POST /products/search in OpenAPI.
 *
 * `text`/`title` follow the caller's locale: a free-text search unions a product's OWN
 * (fallback-language) match with whatever the translations collection matches in the caller's
 * locale chain, so searching in Italian finds a product whose Italian row is the only place the
 * word appears — a product with no such row is still reachable through its own column.
 *
 * @param filters - id, text, priceMin, priceMax, page (1-based), pageSize
 * @param scope - which rows this caller may read ({@link callerScope})
 */
export const search = (
    filters: SearchProductsRequest = {},
    scope?: Record<string, unknown>
): Promise<{
    items: Product[];
    meta: PaginatedMeta;
}> => {
    const pattern = toSearchPattern(filters.text ?? filters.title);

    /**
     * No free-text term: `category`/`tag`/`priceMin`/`priceMax`/`active` still apply as declared
     * on the repository, unioning nothing.
     */
    const resultPromise = pattern
        ? searchWithTranslatedText(filters, scope, pattern)
        : productRepository.search(filters, scope);

    /**
     * `.search()` already normalized every item (`_id` → `id`, promise dates to shop days), so this
     * overlays the caller's locale on top of an already wire-shaped page — one batched query,
     * never one per item. A no-op when nothing is registered or no row matches, which is why
     * this can sit in the base function rather than only in the viewed wrapper below.
     */
    return resultPromise.then((result) =>
        applyTranslations('product', result.items).then((items) => ({ ...result, items }))
    );
};

/**
 * The union half of {@link search}: an entity's own column OR a translated row, both scoped by
 * whatever the caller's filters and visibility already require.
 *
 * `text`/`title` are stripped before `buildWhere` runs a second time — `where.$or` below already
 * carries the product's own match, and leaving them in would AND a second, redundant one in.
 */
const searchWithTranslatedText = (
    filters: SearchProductsRequest,
    scope: Record<string, unknown> | undefined,
    pattern: string
): Promise<{ items: Product[]; meta: PaginatedMeta }> => {
    const { text, title, ...rest } = filters;
    const ownMatch = productRepository.buildWhere({ text, title });

    const candidates = localeCandidatesFor(getCurrentLocale());
    return searchTranslatedEntityIds(
        'product',
        TRANSLATABLE_SEARCH_FIELDS,
        pattern,
        candidates,
        previewDraftTag()
    ).then((translatedIds) => {
        const union =
            translatedIds.length === 0
                ? ownMatch
                : {
                      $or: [ownMatch, { _id: { $in: translatedIds.map((id) => toObjectId(id)) } }]
                  };

        // `withScope`, not a spread: `union` carries an `$or`, and so may the scope.
        return productRepository.search(rest, withScope(union, scope ?? {}));
    });
};

/**
 * `GET /products` / `POST /products/search` — search, as `context.caller` may see it: each row's
 * `actions` is the caller's own, or all `false` for a caller answered from the shared cache.
 *
 * Wraps rather than folds into `search()`: every other caller of `search()` — unit tests among them
 * — reads the catalogue without a `CallerContext` to give. A search is NOT reported from here: the
 * response cache hides most reads, so the browser reports it (`modules/analytics`).
 */
export const searchForCaller = (
    filters: SearchProductsRequest,
    scope: Record<string, unknown> | undefined,
    context: CallerContext
): Promise<{ items: Product[]; meta: PaginatedMeta }> =>
    search(filters, scope).then((result) => {
        const standing = standingOnRead(callerScope, context.caller);
        return {
            ...result,
            items: result.items.map((product) => withActions(product, standing))
        };
    });

/**
 * Every category and tag the PUBLIC catalogue carries, with counts.
 *
 * A pass-through today — `facets()` on the repository already scopes to active, non-deleted rows.
 * Kept here anyway since a controller reaching past the service is the one shape this layer stack
 * disallows.
 *
 * @see docs/understand/layers.md#what-each-layer-should-not-do
 */
export const facets = (): Promise<{ categories: FacetCount[]; tags: FacetCount[] }> =>
    productRepository.facets();
