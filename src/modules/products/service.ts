/**
 * @module
 * Product service: all business logic for the catalogue entity. Delegates raw database access to
 * the repository and stays the one place a controller may call into.
 */

import { getCurrentLocale, getFallbackLocale, localeCandidatesFor, t } from '@infrastructure/i18n';
import {
    applyTranslations,
    isTranslationPlan,
    planTranslations,
    readAllTranslations,
    removeTranslations,
    searchTranslatedEntityIds,
    writeTranslations
} from '@kernel/translation';
import type {
    SearchProductsRequest,
    Product,
    ProductAdmin,
    ProductTranslationFields,
    UpsertTranslationsRequest
} from '@types';
import {
    generateSuccess,
    generateReject,
    type ResponseReject,
    type ResponseSuccess,
    type ResponseErrorItem,
    validationErrors
} from '@infrastructure/http/response';
import type { FacetCount } from '@types';
import { imageStore, applyImageWriteback } from '@infrastructure/adapters/image-store';
import { enqueueIfImagePending } from '@infrastructure/adapters/image.worker';
import { emitDomainEvent } from '@kernel/events';
import type { CallerContext } from '@types';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { recordAudit } from '@infrastructure/observability/audit';
import { productsAnalyticsEvents } from './analytics';
import { productsAuditActions } from './audit';
import { PRODUCT_DELETED, PRODUCT_CREATED, PRODUCT_DEACTIVATED } from './events';
import { zodProductCreateSchema, zodProductUpdateSchema, toProduct } from './model';
import type { ProductDocument } from './model';
import { productRepository } from './repository';
import type { PaginatedMeta } from '@infrastructure/persistence/search';
import { toSearchPattern } from '@infrastructure/persistence/search';
import { toObjectId } from '@infrastructure/persistence/create-repository';
import type { AuthContext } from '@types';
import { accessibleFilter } from '@kernel/access/query';

/**
 * The columns a free-text search compares against — the same pair `repository.ts` declares as
 * `searchable.text`, and the ONLY fields `translatables` registers `product` for in
 * `src/modules/products/module.ts`. Kept here rather than read off the registry: this module
 * already states its own searchable columns once, and a translated search asks the same question
 * one tier down.
 */
const TRANSLATABLE_SEARCH_FIELDS = ['title', 'description'] as const;

/**
 * Validates a product CREATE against the Zod schema; empty array means valid.
 * Takes `unknown` on purpose: this is the boundary that establishes the type, so callers passing
 * raw request bodies don't have to cast on the way in.
 */
export const validateCreateData = (productData: unknown): ResponseErrorItem[] => {
    const parseResult = zodProductCreateSchema.safeParse(productData);
    if (!parseResult.success) return validationErrors(parseResult.error);
    return [];
};

/**
 * Validates a product PATCH against the Zod schema; empty array means valid. Every field is
 * optional at this schema's own level — only the fallback-locale guard inside `translations` can
 * still refuse an otherwise-valid-looking body.
 */
export const validateUpdateData = (productData: unknown): ResponseErrorItem[] => {
    const parseResult = zodProductUpdateSchema.safeParse(productData);
    if (!parseResult.success) return validationErrors(parseResult.error);
    return [];
};

/** Trim, drop blanks, and de-duplicate a category/tag list; `null`/non-array input becomes empty. */
const sanitizeStringArray = (values?: string[] | null): string[] => {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
};

/**
 * Which products a caller is allowed to read.
 *
 * `undefined` for admins, meaning "no restriction"; the published catalogue for everyone else.
 * Why the scope rides in the read rather than being checked after it is the shared rule's to
 * explain — see `accessibleFilter`.
 */
export const callerScope = (context?: AuthContext) => accessibleFilter(context, 'Product');

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
    return searchTranslatedEntityIds('product', TRANSLATABLE_SEARCH_FIELDS, pattern, candidates).then(
        (translatedIds) => {
            const union =
                translatedIds.length === 0
                    ? ownMatch
                    : {
                          $or: [ownMatch, { _id: { $in: translatedIds.map((id) => toObjectId(id)) } }]
                      };

            return productRepository.search(rest, { ...scope, ...union });
        }
    );
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
        return result;
    });

/**
 * Get a single product by ID, already resolved to the caller's locale.
 * Returns undefined if the id is falsy; null if no matching document is found.
 *
 * The wire shape, not a hydrated document: `.toJSON()` runs here — before translation resolution,
 * never after, since resolution is a plain-object overlay that would otherwise lose whatever the
 * document's own transform computes (`available`, `_id` → `id`, dates to ISO strings). Unlike
 * `orders`'/`users`' own `getById`, which hand back the Mongoose document itself — neither of
 * those has a locale-resolution step forcing an earlier `.toJSON()`.
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

        // A single `as` narrows a cast the compiler cannot see through: `toJSON()`'s return type is
        // the schema's own `Document['toJSON']` overload, not this module's wire type.
        return applyTranslations('product', [product.toJSON() as Product]).then(
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
 * Enqueue the digest job for a just-persisted product, when its write carried a pending upload.
 * `pendingImageKey` here means the queue looked ready at upload time (the no-broker path resolves
 * inline before saving, see `readUploadedImage`) — see {@link enqueueIfImagePending} for what
 * happens with it.
 */
const enqueueIfPending = (product: ProductDocument): Promise<ProductDocument> =>
    enqueueIfImagePending(product, 'products', productRepository.writebackImage);

/**
 * Create a new product document in the database.
 *
 * Written with `onHand: 0` regardless of what `data.onHand` asks for — this module never moves
 * that counter (see `./model`'s own docblock). `PRODUCT_CREATED` is how the opening count still
 * happens on this same request: `inventory` (which already imports this module, so this cannot
 * import back) is the one subscriber, and moves the counter to `onHand` through its own
 * `receive()` — one call, ledger row included, same as every other stock change. The product is
 * re-read after the awaited emit so the response reflects the real count whether or not that
 * listener succeeded; a throw there leaves `onHand` at the honest `0` it started from, not a lie.
 */
export const create = (
    data: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> & {
        /** Set alongside the pending-image placeholder — see `readUploadedImage`. */
        pendingImageKey?: string;
    },
    context: CallerContext
): Promise<ProductDocument> =>
    productRepository
        .create({
            ...data,
            onHand: 0,
            categories: sanitizeStringArray(data.categories),
            tags: sanitizeStringArray(data.tags)
        })
        .then((product) =>
            emitDomainEvent(PRODUCT_CREATED, {
                productId: String(product._id),
                onHand: data.onHand ?? 0
            }).then(() => productRepository.findById(String(product._id)))
        )
        .then((product) => {
            // Re-read right after our own create(); absent only if something hard-deleted it
            // within that same tick, which nothing in this flow does.
            const created = product!;
            recordAudit(context, {
                action: productsAuditActions.ADMIN_PRODUCT_CREATED,
                outcome: 'success',
                target_type: 'product',
                target_id: String(created._id)
            });
            return enqueueIfPending(created);
        });

/**
 * Update an existing product document.
 * If a new image URL differs from the old one, deletes the old image file after saving.
 */
export const update = (
    product: ProductDocument,
    data: Partial<Omit<Product, 'id'>> & {
        /** Set alongside a new pending-image placeholder — see `readUploadedImage`. */
        pendingImageKey?: string;
    }
): Promise<ProductDocument> => {
    // Apply incoming field changes
    if (data.title !== undefined) product.title = data.title;
    if (data.price !== undefined) product.price = data.price;
    /*
     * No stock write here, and the contract offers none: `UpdateProductRequest` and its
     * siblings carry no counter field.
     *
     * An absolute write would be wrong here: setting a count to 40 says nothing about what
     * happened, so the ledger would have to guess by subtracting the old value, and two concurrent
     * edits could each overwrite the other's sale. Counters move only through signed, conditional
     * transitions in `@modules/inventory` (`POST /inventory/receipts`,
     * `POST /inventory/adjustments`), each of which says what happened and can't lose a sale.
     */
    if (data.description !== undefined) product.description = data.description;
    if (data.active !== undefined) product.active = data.active;
    if (data.categories !== undefined) product.categories = sanitizeStringArray(data.categories);
    if (data.tags !== undefined) product.tags = sanitizeStringArray(data.tags);
    if (data.weight !== undefined) product.weight = data.weight;
    if (data.taxClass !== undefined) product.taxClass = data.taxClass;
    if (data.requiresShipping !== undefined) product.requiresShipping = data.requiresShipping;

    // If a new image was uploaded, update the url, thumbnail and pending key together — see
    // `applyImageWriteback`'s own docblock for the gate shared with `users`' own `update`.
    const oldImageUrl = applyImageWriteback(product, data);

    // Persist the updated document
    return productRepository.save(product).then((updatedProduct) => {
        // After saving the new image path, delete the old image file (and its thumbnail).
        return (oldImageUrl ? imageStore.remove(oldImageUrl) : Promise.resolve()).then(() =>
            enqueueIfPending(updatedProduct)
        );
    });
};

/**
 * Update an existing product by ID.
 * Fetches the document then delegates to update().
 */
export const updateById = (
    id: string,
    data: Partial<Omit<Product, 'id'>> & { pendingImageKey?: string },
    context: CallerContext
): Promise<ResponseSuccess<ProductDocument> | ResponseReject> =>
    productRepository.findById(id).then((product) => {
        // Returned, not thrown: a thrown miss is indistinguishable from a genuine database error
        // at the `.catch()` that has to tell them apart.
        if (!product) return generateReject(404, [t('products.not-found')]);

        // Read before `update()` mutates `product.active` in place — the flip is the whole
        // signal `PRODUCT_DEACTIVATED` exists to report, same shape `users`' ban/unban audit uses.
        const wasActive = product.active;

        return update(product, data).then((updated) => {
            recordAudit(context, {
                action: productsAuditActions.ADMIN_PRODUCT_UPDATED,
                outcome: 'success',
                target_type: 'product',
                target_id: id
            });

            return (
                wasActive !== false && updated.active === false
                    ? emitDomainEvent(PRODUCT_DEACTIVATED, { productId: id })
                    : Promise.resolve()
            ).then(() => generateSuccess(updated));
        });
    });

/**
 * `ProductTranslationsWrite` (this module's own flat write shape, `{ title, description? } | null`
 * per locale) wrapped for the `kernel/translation.ts` port, which speaks the generic door's
 * `UpsertTranslationsRequest` — one locale's `{ fields, origin? }` rather than the flat shape this
 * module's own contract uses. `origin` is left to the port's own default (`human`): an editor's
 * write through `/products/{id}` is never a machine import.
 */
const toUpsertTranslationsRequest = (
    translations: Record<string, ProductTranslationFields | null>
): UpsertTranslationsRequest =>
    Object.fromEntries(
        Object.entries(translations).map(([locale, entry]) => [
            locale,
            entry === null
                ? null
                : {
                      fields: {
                          title: entry.title,
                          ...(entry.description === undefined
                              ? {}
                              : { description: entry.description })
                      }
                  }
        ])
    );

/**
 * A translations-plan rejection, reshaped for THIS module's write body — `translations` is a
 * nested field here, unlike the generic translator's door (an unwrapped body), so a pointer of
 * `it` becomes `translations.it` and `it.title` becomes `translations.it.title`.
 */
const prefixTranslationErrors = (rejection: ResponseReject): ResponseReject => ({
    ...rejection,
    errors: rejection.errors.map((error) =>
        typeof error.details?.field === 'string'
            ? {
                  ...error,
                  details: { ...error.details, field: `translations.${error.details.field}` }
              }
            : error
    )
});

/**
 * Create a product and its translation rows in one operation — the create door of the
 * multilingual product write surface. Two validations run before anything is WRITTEN: the product
 * fields' shape (`zodProductCreateSchema`, which also refuses a missing/`null` fallback locale)
 * and the translations batch's locale/field-name legality (`planTranslations`, the
 * `kernel/translation.ts` port, validates without writing). Nothing in this codebase runs a
 * cross-collection transaction, so the achievable guarantee stops there: nothing is written until
 * both validations have already passed, not that the product write and the translations write
 * that follow are atomic with each other.
 *
 * `imageExtras` (`thumbnailUrl`/`pendingImageKey`) is server-derived, never part of the contract
 * body, so it never passes through `zodProductCreateSchema` — merged in only once validation has
 * already succeeded, the same order the controller keeps for its own merge.
 */
export const writeCreate = async (
    data: Record<string, unknown>,
    context: CallerContext,
    imageExtras: { thumbnailUrl?: string; pendingImageKey?: string } = {}
): Promise<ResponseSuccess<ProductDocument> | ResponseReject> => {
    const parsed = zodProductCreateSchema.safeParse(data);
    if (!parsed.success) return generateReject(422, validationErrors(parsed.error));

    const plan = await planTranslations(
        'product',
        toUpsertTranslationsRequest(parsed.data.translations)
    );
    if (!isTranslationPlan(plan)) return prefixTranslationErrors(plan);

    // Guaranteed present and non-null by the schema's own refinement — a plan cannot validate
    // without it.
    const fallbackEntry = parsed.data.translations[getFallbackLocale()] as ProductTranslationFields;
    const { translations: _translations, ...productFields } = parsed.data;

    const product = await create(
        {
            ...productFields,
            ...imageExtras,
            title: fallbackEntry.title,
            description: fallbackEntry.description ?? ''
        },
        context
    );

    await writeTranslations('product', product.id, plan, context.caller.id ?? undefined);

    return generateSuccess(product, 201);
};

/**
 * Update a product and merge its translation rows in one operation — the PATCH door of the
 * multilingual product write surface. Delegates the product write itself to {@link updateById},
 * which already owns the 404 check and the audit emit; this only adds the translations half
 * around it, so there is exactly one path deciding what "the product was updated" means.
 *
 * `imageExtras` — see {@link writeCreate}.
 */
export const writeUpdate = async (
    id: string,
    data: Record<string, unknown>,
    context: CallerContext,
    imageExtras: { thumbnailUrl?: string; pendingImageKey?: string } = {}
): Promise<ResponseSuccess<ProductDocument> | ResponseReject> => {
    const parsed = zodProductUpdateSchema.safeParse(data);
    if (!parsed.success) return generateReject(422, validationErrors(parsed.error));

    const { translations, ...productFields } = parsed.data;

    const plan = translations
        ? await planTranslations('product', toUpsertTranslationsRequest(translations))
        : undefined;
    if (plan && !isTranslationPlan(plan)) return prefixTranslationErrors(plan);

    // An upsert at the fallback locale is the only slot that touches the derived index column;
    // `null` there is already refused by `zodProductUpdateSchema`'s own refinement.
    const fallbackEntry = translations?.[getFallbackLocale()];
    const derivedFields = fallbackEntry
        ? { title: fallbackEntry.title, description: fallbackEntry.description ?? '' }
        : {};

    const result = await updateById(
        id,
        { ...productFields, ...imageExtras, ...derivedFields },
        context
    );
    if (!result.success) return result;

    if (plan) await writeTranslations('product', id, plan, context.caller.id ?? undefined);

    return result;
};

/**
 * `GET /products/{id}/admin` — a product with every language it has a row for, for the editor's
 * form to populate its tabs. Unscoped (the route is admin-only) and never resolved to one
 * language, unlike {@link getById}.
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

            return { ...toProduct(product), translations };
        });
    });

/**
 * Remove a product document (soft or hard delete). Hard delete also removes the image file;
 * soft delete toggles `deletedAt`, acting as a restore when already soft-deleted.
 *
 * `product.deleted` is emitted and awaited before the write, so a listener that cleans up
 * references (cart empties the product from every cart) has run before it can stop resolving —
 * this module doesn't know who listens, which keeps the dependency arrow one-way.
 *
 * @param hardDelete - `true` destroys the row; `false` toggles `deletedAt`, which
 *   acts as a restore when the row is already soft-deleted.
 */
export const remove = (
    product: ProductDocument,
    hardDelete = false
): Promise<ResponseSuccess<ProductDocument> | ResponseSuccess<undefined> | ResponseReject> => {
    const id = product._id.toString();

    // HARD delete
    // Translations go with it, in this same operation — through the port, never the
    // `PRODUCT_DELETED` event above: that event fires on a SOFT delete too, with the same
    // `productId` — `hardDelete` on the payload is what lets a subscriber (`inventory`'s level
    // row, `orders`' pending-order cancellation) tell the two apart. Soft delete is a flip that
    // doubles as a restore, and both the rows and the counters must survive it.
    if (hardDelete)
        return emitDomainEvent(PRODUCT_DELETED, { productId: id, hardDelete: true })
            .then(() => productRepository.deleteOne(product))
            .then(() => removeTranslations('product', id))
            .then(() => imageStore.remove(product.imageUrl))
            .then(() => generateSuccess(undefined, 200, t('products.hard-deleted')));

    // SOFT delete (or restore)
    // A FLIP, not an assignment: run against an already soft-deleted product this restores it,
    // which is what the `hardDelete: false` half of `hardDeleteSchema` means.
    product.deletedAt = product.deletedAt ? undefined : new Date();
    return emitDomainEvent(PRODUCT_DELETED, { productId: id, hardDelete: false })
        .then(() => productRepository.save(product))
        .then((saved) => generateSuccess(saved, 200, t('products.soft-deleted')));
};

/**
 * Remove a product by ID (soft or hard delete).
 * Fetches the document then delegates to remove().
 *
 * @param hardDelete - `true` destroys the row; `false` toggles `deletedAt`, which
 *   acts as a restore when the row is already soft-deleted.
 */
export const removeById = (
    id: string,
    hardDelete = false
): Promise<ResponseSuccess<ProductDocument> | ResponseSuccess<undefined> | ResponseReject> =>
    productRepository
        .findById(id)
        .then((product) =>
            product ? remove(product, hardDelete) : generateReject(404, [t('products.not-found')])
        );

/**
 * Every category and tag the PUBLIC catalogue carries, with counts.
 *
 * A pass-through today — `facets()` on the repository already scopes to active, non-deleted rows.
 * Kept here anyway since a controller reaching past the service is the one shape this layer stack
 * disallows; see `docs/theory/layers.md`.
 */
const facets = (): Promise<{ categories: FacetCount[]; tags: FacetCount[] }> =>
    productRepository.facets();

/**
 * The plain, untransformed document — `inventory` and `orders` read a product's live counters
 * this way, never through `getById`'s scoped/transformed shape.
 */
const findByIdRaw = (productId: string) => productRepository.findByIdRaw(productId);

/** The publicly visible product with this id, or `null` — `cart` and `wishlist`'s one read. */
const findPublicById = (productId: string) => productRepository.findPublicById(productId);

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
const findManyByIds = (ids: readonly string[]) =>
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
const countPublic = (ids: readonly string[]): Promise<number> =>
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
const syncStockCache = (productId: string, counters: { onHand: number; reserved: number }) =>
    productRepository.syncStockCache(productId, counters);

/** The service's public surface — every controller and cross-module caller goes through this. */
export const productService = {
    validateCreateData,
    validateUpdateData,
    callerScope,
    search,
    searchViewed,
    facets,
    getById,
    getByIdViewed,
    getAdmin,
    create,
    update,
    updateById,
    writeCreate,
    writeUpdate,
    remove,
    removeById,
    // A controller may not reach `./model` directly (the persistence wall), so the shaping
    // helper it needs to build a response rides through the service instead.
    toProduct,
    findByIdRaw,
    findPublicById,
    findManyByIds,
    countPublic,
    syncStockCache
};
