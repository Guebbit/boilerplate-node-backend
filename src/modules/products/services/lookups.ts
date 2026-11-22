/**
 * @module
 * Read and cache doors for sibling modules — the service is the door onto this collection.
 */

import { toObjectId } from '@infrastructure/persistence/create-repository';
import { getFallbackLocale } from '@infrastructure/i18n';
import { readAllTranslations, readServedTranslations } from '@kernel/translation';
import type { ProductTranslationFields } from '@types';
import type { ProductDocument } from '../model';
import { productRepository, type ListedProduct } from '../repository';

/**
 * The plain, untransformed document — `inventory` and `orders` read a product's own columns this
 * way, never through `getById`'s scoped/transformed shape.
 */
export const findByIdRaw = (productId: string) => productRepository.findByIdRaw(productId);

/**
 * {@link findByIdRaw} narrowed to the rows a caller may read ({@link callerScope}): a hidden or
 * removed product is `null` to a caller who lacks `display:Product`, exactly as a missing one is,
 * so a write that snapshots the product cannot widen what that caller may read.
 * @param scope - the caller's scope from `callerScope`
 */
export const findByIdRawScoped = (productId: string, scope: Record<string, unknown>) =>
    productRepository.findByIdRawScoped(productId, scope);

/**
 * Whether a product exists and is not soft-deleted — the question a late `product.deleted` handler
 * asks before it acts: a retried delivery can arrive after the product was restored.
 *
 * @param productId - the product the event named
 */
export const isLive = (productId: string): Promise<boolean> =>
    productRepository
        .findByIdRaw(productId)
        .then((product) => product !== null && !product.deletedAt);

/** The publicly visible product with this id, or `null` — `cart` and `wishlist`'s one read. */
export const findPublicById = (productId: string) => productRepository.findPublicById(productId);

/**
 * Every product in `ids`, plain and untransformed, in one round trip — `orders` joins them onto
 * its own rows by id rather than reading one at a time.
 *
 * Returns every id, past the `findAll` default cap; a malformed id rejects the promise.
 *
 * @param ids - the product ids to read back
 */
export const findManyByIds = (ids: readonly string[]) => productRepository.findByIds(ids);

/**
 * How many of `ids` are still publicly visible — `@modules/inventory`'s low-stock gauge asks this
 * rather than joining into this module's own collection to answer it itself (the service is the
 * door). Reuses the same `publicScope()` a stranger's own reads are narrowed to, so a role editing
 * that rule never has to remember a second, hand-rolled copy of it living in a sibling module's
 * aggregation pipeline.
 *
 * @param ids - candidate product ids
 * @param options - `excludePreorders` leaves out the products on sale before their release date:
 *   they wait for stock that does not exist yet, which is not "running low"
 * @returns how many of them are active and not soft-deleted
 */
export const countPublic = (
    ids: readonly string[],
    options: { excludePreorders?: boolean } = {}
): Promise<number> =>
    ids.length === 0
        ? Promise.resolve(0)
        : Promise.resolve().then(() =>
              productRepository.count({
                  ...productRepository.publicScope(),
                  _id: { $in: ids.map((id) => toObjectId(id)) },
                  // The same rule as `isPreorder`, as a filter: public scope already makes it active.
                  ...(options.excludePreorders
                      ? {
                            $nor: [
                                { releaseDate: { $gt: new Date() }, purchasable: { $ne: false } }
                            ]
                        }
                      : {})
              })
          );

/**
 * The part of a product a name is read from: a hydrated document and a lean read both carry it,
 * so a caller that already holds either need not read the product again.
 */
type NamedProduct = Pick<ProductDocument, '_id' | 'title' | 'description'>;

/**
 * A product's translation rows as the wire shape, locale → fields.
 *
 * @param rows - locale → the row's fields, as the translation port reads them
 */
const toProductTranslations = (
    rows: Map<string, Record<string, string>>
): Record<string, ProductTranslationFields> =>
    Object.fromEntries(
        [...rows].map(([locale, fields]) => [
            locale,
            {
                title: fields.title,
                /**
                 * `TranslationFields` types as `Record<string, string>`, but a row can genuinely
                 * omit the key — `in` is a runtime presence check `fields.description ===
                 * undefined` isn't, since the index signature already promises every key a
                 * `string`.
                 */
                ...('description' in fields ? { description: fields.description } : {})
            }
        ])
    );

/**
 * The product's own text — the default language (`NODE_FALLBACK_LOCALE`), whatever language the
 * request resolves to.
 *
 * @param product - the document whose columns are that text
 */
export const sourceOf = (product: NamedProduct): ProductTranslationFields => ({
    title: product.title,
    ...(product.description ? { description: product.description } : {})
});

/**
 * A product's title and description in every language but the default one, locale → fields —
 * drafts included, for the editor's admin read. The default language is {@link sourceOf}.
 *
 * @param product - the document whose translations to collect
 */
export const translationsOf = (
    product: ProductDocument
): Promise<Record<string, ProductTranslationFields>> =>
    readAllTranslations('product', product._id.toString()).then(toProductTranslations);

/**
 * A product's name in every language the shop SERVES it in, locale → title: a language switched
 * on, plus the default. For a message that has to outlive the product: copy the names in, never
 * look the product up again. A draft language's title is never copied in, so no customer can read
 * it back from an inbox, a stream, an export or a mail.
 *
 * @param product - the product whose names to collect, hydrated or lean
 */
export const titlesOf = (product: NamedProduct): Promise<Record<string, string>> =>
    readServedTranslations('product', product._id.toString()).then((rows) => ({
        // The other languages first, so the default's own title is the one a row can never shadow.
        ...Object.fromEntries(
            // A row may hold a description alone: it names no title, so the default's reads through.
            [...rows]
                .filter(([, fields]) => 'title' in fields)
                .map(([locale, fields]) => [locale, fields.title])
        ),
        [getFallbackLocale()]: product.title
    }));

/**
 * {@link titlesOf} for an id: the names of a product in any state, soft-deleted included, or an
 * empty map when there is no such product (a hard-deleted one has none left to give).
 *
 * @param productId - the product to name
 */
export const titlesById = (productId: string): Promise<Record<string, string>> =>
    productRepository.findById(productId).then((product) => (product ? titlesOf(product) : {}));

/**
 * One page of the public catalogue for a sitemap: id and last-change date only, in a stable order.
 *
 * @param page - 1-based page number
 * @param pageSize - how many products a page holds
 */
export const listPublicPage = (page: number, pageSize: number): Promise<ListedProduct[]> =>
    productRepository.listedPage((page - 1) * pageSize, pageSize);

/** How many products the public catalogue holds — a sitemap sizes its pages from it. */
export const countListed = (): Promise<number> =>
    productRepository.count(productRepository.publicScope());
