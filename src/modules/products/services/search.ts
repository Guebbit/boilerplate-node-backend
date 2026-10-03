/**
 * @module
 * Catalogue search, with the caller's locale unioned in, and the public facets.
 */

import { getCurrentLocale, localeCandidatesFor } from '@infrastructure/i18n';
import { applyTranslations, searchTranslatedEntityIds } from '@kernel/translation';
import type { SearchProductsRequest, Product, FacetCount, CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import type { PaginatedMeta } from '@infrastructure/persistence/search';
import { toSearchPattern } from '@infrastructure/persistence/search';
import { toObjectId, withScope } from '@infrastructure/persistence/create-repository';
import { productsAnalyticsEvents } from '../analytics';
import { productRepository } from '../repository';
import { canSeeStock, redactStock } from './stock-view';

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
 * @param filters - id, text, minPrice, maxPrice, page (1-based), pageSize
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

    // No free-text term: `category`/`tag`/`minPrice`/`maxPrice`/`active` still apply as declared
    // on the repository, unioning nothing.
    const resultPromise = pattern
        ? searchWithTranslatedText(filters, scope, pattern)
        : productRepository.search(filters, scope);

    // `.search()` already normalized every item (`_id` → `id`, dates to ISO strings), so this
    // overlays the caller's locale on top of an already wire-shaped page — one batched query,
    // never one per item. A no-op when nothing is registered or no row matches, which is why
    // this can sit in the base function rather than only in the viewed wrapper below.
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
        candidates
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
 * `GET /products` / `POST /products/search` — search, and report that a search happened.
 *
 * Wraps rather than folds into `search()`: every other caller — unit tests, `facets` below — reads
 * the catalogue without a `CallerContext` to give and without it being a `products_searched`
 * moment.
 */
export const searchViewed = (
    filters: SearchProductsRequest,
    scope: Record<string, unknown> | undefined,
    context: CallerContext
): Promise<{ items: Product[]; meta: PaginatedMeta }> =>
    search(filters, scope).then((result) => {
        emitAnalyticsEvent({
            ...buildAnalyticsBase(context),
            event: productsAnalyticsEvents.PRODUCTS_SEARCHED,
            properties: {
                text: filters.text,
                page: result.meta.page,
                pageSize: result.meta.pageSize,
                result_count: result.items.length
            }
        });
        // The exact counters go only to a caller holding `inventory.any.read` — see `./stock-view`.
        const seesStock = canSeeStock(context.caller);
        return {
            ...result,
            items: result.items.map((product) => redactStock(product, seesStock))
        };
    });

/**
 * Every category and tag the PUBLIC catalogue carries, with counts.
 *
 * A pass-through today — `facets()` on the repository already scopes to active, non-deleted rows.
 * Kept here anyway since a controller reaching past the service is the one shape this layer stack
 * disallows; see `docs/theory/layers.md`.
 */
export const facets = (): Promise<{ categories: FacetCount[]; tags: FacetCount[] }> =>
    productRepository.facets();
