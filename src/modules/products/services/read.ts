/**
 * @module
 * Single-product reads: the caller's scope, the resolved view, and every language for a caller
 * who may read translations.
 */

import { applyTranslations } from '@kernel/translation';
import type { Product, CallerContext, Caller } from '@types';
import { carryVersion } from '@infrastructure/persistence/versioning';
import { accessibleFilterFor } from '@kernel/access/query';
import { presentProduct } from '../presenter';
import { canSeeStock, redactStock } from './stock-view';
import { productRepository } from '../repository';
import { translationsWithFallback } from './lookups';
import { canSeeTranslations } from './translation-view';
import type { ProductDocument } from '../model';

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
 * One stored product as the wire shape in the request's language.
 *
 * @param product - the document to present and resolve
 */
const resolveToLocale = (product: ProductDocument): Promise<Product> =>
    applyTranslations('product', [presentProduct(product)]).then(([resolved]) => resolved);

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

    return productRepository
        .findByIdScoped(id, scope)
        .then((product) => (product ? resolveToLocale(product) : product));
};

/**
 * `GET /products/:id` — get a product, as `context.caller` may see it: the exact stock counters
 * stay for a holder of `read:StockLevel` (see `./stock-view`), and `translations` (every language,
 * drafts included) for a holder of `read:Translation` (see `./translation-view`).
 *
 * The top-level `title`/`description` are always the request's resolved language, even beside
 * `translations`: staff browsing the shop in Italian must not see the fallback language there.
 *
 * Wraps rather than folds into `getById()`: most callers (unit tests, other services resolving a
 * product they already know about) have no `CallerContext`. A view is NOT reported from here: the
 * response cache hides most reads, so the browser reports it (`modules/analytics`).
 */
export const getByIdForCaller = (
    id: string | undefined,
    scope: Record<string, unknown> | undefined,
    context: CallerContext
): Promise<Product | null | undefined> => {
    if (!id) return Promise.resolve(undefined);

    return productRepository.findByIdScoped(id, scope).then((product) => {
        if (!product) return product;

        return resolveToLocale(product)
            .then((resolved) => withTranslations(product, resolved, context.caller))
            .then((visible) => redactStock(visible, canSeeStock(context.caller)));
    });
};

/**
 * The resolved product plus its `translations`, for a caller who may read them; untouched
 * otherwise.
 *
 * @param product - the stored document, whose rows are read
 * @param resolved - the same product in the request's language
 * @param caller - `request.caller`
 */
const withTranslations = (
    product: ProductDocument,
    resolved: Product,
    caller?: Caller
): Promise<Product> => {
    if (!canSeeTranslations(caller)) return Promise.resolve(resolved);

    return translationsWithFallback(product).then((translations) =>
        carryVersion(resolved, { ...resolved, translations })
    );
};
