/**
 * @module
 * Single-product reads: the caller's scope, the resolved view, the editor's all-locales view.
 */

import { getFallbackLocale } from '@infrastructure/i18n';
import { applyTranslations, readAllTranslations } from '@kernel/translation';
import type {
    Product,
    ProductAdmin,
    ProductTranslationFields,
    CallerContext,
    Caller
} from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { accessibleFilterFor } from '@kernel/access/query';
import { productsAnalyticsEvents } from '../analytics';
import { presentProduct } from '../presenter';
import { productRepository } from '../repository';

/**
 * Which products a caller is allowed to read.
 *
 * Takes `request.caller`, not the session: a session and an API key both resolve to one, so a key
 * holding `products.any.read` sees what a session holding it sees. `{}` for an unrestricted
 * caller, the published catalogue for everyone else. Why the scope rides in the read rather than
 * being checked after it is the shared rule's to explain — see `accessibleFilterFor`.
 *
 * @param caller - `request.caller`, or `undefined` for an anonymous request
 */
export const callerScope = (caller?: Caller) => accessibleFilterFor(caller, 'Product');

/**
 * Get a single product by ID, already resolved to the caller's locale.
 * Returns undefined if the id is falsy; null if no matching document is found.
 *
 * The wire shape, not a hydrated document: `presentProduct` runs here — before translation
 * resolution, never after, since resolution is a plain-object overlay that would otherwise lose
 * whatever the presenter computes (`available`, `_id` → `id`, dates to ISO strings). Unlike
 * `orders`'/`users`' own `getById`, which hand back the Mongoose document itself — neither of
 * those has a locale-resolution step forcing an earlier presenting.
 *
 * @param scope - which rows this caller may read ({@link callerScope})
 */
export const getById = (
    id: string | undefined,
    scope?: Record<string, unknown>
): Promise<Product | null | undefined> => {
    // Return early without triggering a DB call when no id is provided
    if (!id) return Promise.resolve(undefined);

    return productRepository.findByIdScoped(id, scope).then((product) => {
        if (!product) return product;

        return applyTranslations('product', [presentProduct(product)]).then(
            ([resolved]) => resolved
        );
    });
};

/**
 * `GET /products/:id` — get a product, and report that it was viewed.
 *
 * Wraps rather than folds into `getById()`, for the same reason `searchViewed` does: most callers
 * (unit tests, other services resolving a product they already know about) have no `CallerContext`
 * and are not a `product_viewed` moment.
 */
export const getByIdViewed = (
    id: string | undefined,
    scope: Record<string, unknown> | undefined,
    context: CallerContext
) =>
    getById(id, scope).then((product) => {
        if (product)
            emitAnalyticsEvent({
                ...buildAnalyticsBase(context),
                event: productsAnalyticsEvents.PRODUCT_VIEWED,
                properties: { product_id: id }
            });
        return product;
    });

/**
 * `GET /products/{id}/admin` — a product with every language it has a row for, for the editor's
 * form to populate its tabs. Unscoped (the route is admin-only) and never resolved to one
 * language, unlike {@link getById}.
 *
 * Without a translation provider (`locales` uninstalled), or with one that simply has no row yet
 * for this product's fallback language, `readAllTranslations` answers no rows at all — the
 * fallback tab is built here from the product's own `title`/`description` columns instead, which
 * are the fallback language's real content either way (see `update`'s `derivedFields`).
 */
export const getAdmin = (id: string): Promise<ProductAdmin | null> =>
    productRepository.findById(id).then((product) => {
        if (!product) return null;

        return readAllTranslations('product', id).then((rows) => {
            const translations: Record<string, ProductTranslationFields> = {};
            for (const [locale, fields] of rows)
                translations[locale] = {
                    title: fields.title,
                    // `TranslationFields` types as `Record<string, string>`, but a row can genuinely
                    // omit the key — `in` is a runtime presence check `fields.description ===
                    // undefined` isn't, since the index signature already promises every key is a
                    // `string`.
                    ...('description' in fields ? { description: fields.description } : {})
                };

            const fallbackLocale = getFallbackLocale();
            if (!(fallbackLocale in translations))
                translations[fallbackLocale] = {
                    title: product.title,
                    ...(product.description ? { description: product.description } : {})
                };

            return { ...presentProduct(product), translations };
        });
    });
