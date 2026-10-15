/**
 * @module
 * Single-product reads: the caller's scope, the resolved view, the editor's all-locales view.
 */

import { applyTranslations } from '@kernel/translation';
import type { Product, ProductAdmin, CallerContext, Caller } from '@types';
import { carryVersion } from '@infrastructure/persistence/versioning';
import { accessibleFilterFor } from '@kernel/access/query';
import { presentProduct } from '../presenter';
import { canSeeStock, redactStock } from './stock-view';
import { productRepository } from '../repository';
import { translationsWithFallback } from './lookups';

/**
 * Which products a caller is allowed to read.
 *
 * Takes `request.caller`, not the session: a session and an API key both resolve to one, so a key
 * holding `display:Product` sees what a session holding it sees. `{}` for an unrestricted
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
 * `GET /products/:id` — get a product, as `context.caller` may see it: the exact stock counters
 * stay for a holder of `read:StockLevel` — see `./stock-view`.
 *
 * Wraps rather than folds into `getById()`: most callers (unit tests, other services resolving a
 * product they already know about) have no `CallerContext`. A view is NOT reported from here: the
 * response cache hides most reads, so the browser reports it (`modules/analytics`).
 */
export const getByIdForCaller = (
    id: string | undefined,
    scope: Record<string, unknown> | undefined,
    context: CallerContext
) =>
    getById(id, scope).then((product) =>
        product ? redactStock(product, canSeeStock(context.caller)) : product
    );

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
export const getAdmin = (id: string, caller?: Caller): Promise<ProductAdmin | null> =>
    productRepository.findById(id).then((product) => {
        if (!product) return null;

        return translationsWithFallback(product).then((translations) =>
            redactStock(
                carryVersion(product, { ...presentProduct(product), translations }),
                canSeeStock(caller)
            )
        );
    });
