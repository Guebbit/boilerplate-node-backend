/**
 * @module
 * Read and cache doors for sibling modules — the service is the door onto this collection.
 */

import { toObjectId } from '@infrastructure/persistence/create-repository';
import { getFallbackLocale } from '@infrastructure/i18n';
import { readAllTranslations } from '@kernel/translation';
import type { ProductDocument } from '../model';
import { productRepository } from '../repository';

/**
 * The plain, untransformed document — `inventory` and `orders` read a product's live counters
 * this way, never through `getById`'s scoped/transformed shape.
 */
export const findByIdRaw = (productId: string) => productRepository.findByIdRaw(productId);

/** The publicly visible product with this id, or `null` — `cart` and `wishlist`'s one read. */
export const findPublicById = (productId: string) => productRepository.findPublicById(productId);

/**
 * Every product in `ids`, plain and untransformed, in one round trip — `orders` joins them onto
 * its own rows by id rather than reading one at a time.
 *
 * `Promise.resolve().then(...)` rather than a bare call: `toObjectId` throws on a malformed id,
 * and deferring the `.map()` into the callback turns that into a rejection — the convention
 * `orders/services/crud.ts#create` states for the same reason, so a bad id reaches every caller
 * as a rejected promise like every other failure here, never a synchronous throw out of a
 * function every caller otherwise treats as `Promise`-returning.
 *
 * @param ids - the product ids to read back
 */
export const findManyByIds = (ids: readonly string[]) =>
    Promise.resolve().then(() =>
        productRepository.findAll({ _id: { $in: ids.map((id) => toObjectId(id)) } })
    );

/**
 * How many of `ids` are still publicly visible — `@modules/inventory`'s low-stock gauge asks this
 * rather than joining into this module's own collection to answer it itself (see
 * `docs/theory/strategic-ddd.md` §5: "the service is the door"). Reuses the same
 * `publicScope()` a stranger's own reads are narrowed to, so a role editing that rule never has
 * to remember a second, hand-rolled copy of it living in a sibling module's aggregation pipeline.
 *
 * @param ids - candidate product ids
 * @returns how many of them are active and not soft-deleted
 */
export const countPublic = (ids: readonly string[]): Promise<number> =>
    ids.length === 0
        ? Promise.resolve(0)
        : Promise.resolve().then(() =>
              productRepository.count({
                  ...productRepository.publicScope(),
                  _id: { $in: ids.map((id) => toObjectId(id)) }
              })
          );

/**
 * Mirror `@modules/inventory`'s stock level onto this product's own document, purely so a
 * catalogue read still needs no join. `@modules/inventory` is this function's only legitimate
 * caller — it is the sole writer of `onHand`/`reserved`, this is the door, never a place that
 * decides whether a change is legal. See
 * `docs/modules/inventory.md#why-products-still-carries-a-copy`.
 *
 * @param productId - the product whose cached counters are being brought into step
 * @param counters - the values `@modules/inventory` just committed as the source of truth
 */
export const syncStockCache = (productId: string, counters: { onHand: number; reserved: number }) =>
    productRepository.syncStockCache(productId, counters);

/**
 * A product's name in every language it has one in, locale → title.
 *
 * The product's own `title` column IS the fallback language's name, so it fills that slot when the
 * translation port has no row for it (or no `locales` module at all) — the same rule the admin
 * read applies. For a message that has to outlive the product: copy the names in, never look the
 * product up again.
 *
 * @param product - the document whose names to collect
 */
export const titlesOf = (product: ProductDocument): Promise<Record<string, string>> =>
    readAllTranslations('product', product._id.toString()).then((rows) => {
        const titles: Record<string, string> = {};
        for (const [locale, fields] of rows) titles[locale] = fields.title;

        const fallbackLocale = getFallbackLocale();
        if (!(fallbackLocale in titles)) titles[fallbackLocale] = product.title;
        return titles;
    });

/**
 * {@link titlesOf} for an id: the names of a product in any state, soft-deleted included, or an
 * empty map when there is no such product (a hard-deleted one has none left to give).
 *
 * @param productId - the product to name
 */
export const titlesById = (productId: string): Promise<Record<string, string>> =>
    productRepository.findById(productId).then((product) => (product ? titlesOf(product) : {}));
