/**
 * @module
 * Express router for the product catalogue: public read, admin write, cached where the response
 * does not depend on the caller. Route order matters where a static segment (`/search`,
 * `/facets`, `/settings`) would otherwise be swallowed by `/:id`.
 */

import type { Request } from 'express';
import { Router } from 'express';
import { getAuth, isAuthOrCredential, requirePermission } from '@kernel/middlewares/authorizations';
import { previewDraftLanguage } from '@kernel/middlewares/locale-preview';
import { uploadLimiter } from '@infrastructure/http/middlewares/rate-limit';
import { upload } from '@infrastructure/http/middlewares/upload';
import { idempotencyKey } from '@infrastructure/http/middlewares/idempotency';
import {
    getProducts,
    searchProductsKeyParameters,
    searchProductsKeyValues,
    searchProductsOrderedParameters
} from './controllers/get-products';
import { createProduct } from './controllers/post-product';
import { replaceProduct, updateProduct } from './controllers/update-product';
import { deleteProducts } from './controllers/delete-products';
import { restoreProducts } from './controllers/post-product-restore';
import { getProductItem } from './controllers/get-product';
import { getCatalogFacets } from './controllers/get-catalog-facets';
import { invalidateCache, searchCache, setCache } from '@infrastructure/http/middlewares/cache';
import { routeFlag } from '@infrastructure/http/middlewares/route-flag';
import { hasAnonymousReadScope } from '@kernel/access/query';
import { productService } from './services';
import { canSeeTranslations } from './services/translation-view';
import { HOUR_SECONDS } from '@domain-primitives/time';

/** Express router for product catalogue endpoints (public read, admin write). */
export const router = Router();

/**
 * `getAuth` on everything, no identity guard here: the reads below are a storefront and must
 * answer an anonymous browser. Each write names its own guard instead, and that guard is
 * `isAuthOrCredential` — catalogue writes are `Product`/`Translation` rules over
 * the tenant's own data, so a PIM or a supplier feed may hold them.
 *
 * @see docs/understand/security.md#machine-to-machine-credentials
 */
router.use(getAuth);

/**
 * A caller who reads exactly what a guest reads shares the guest's cached entry; a caller who
 * sees more (admins — inactive products included, or every language's `translations`) bypasses
 * Redis entirely rather than risk serving or storing their wider answer under that shared key.
 * `hasAnonymousReadScope` is what makes the scope half safe BY CONSTRUCTION — see its own
 * docblock; the field-level check is separate on purpose, since a custom API key can hold
 * `read:Translation` alone.
 */
const cacheScopeKey = (request: Request): boolean =>
    hasAnonymousReadScope(productService.callerScope, request.caller) &&
    !canSeeTranslations(request.caller);

/**
 * `previewDraftLanguage` leads each of the three catalogue reads: it must run before `setCache`,
 * whose key is built from `request.locale`, or a draft answer could be stored under a live key.
 */

/**
 * Shared cache middleware for both search entry points, keyed on the query parameters that
 * change the answer. `browserRevalidate`: Redis keeps the answer for the hour, a browser checks
 * first and gets a 304 while nothing changed; the POST spelling answers `no-store` regardless.
 */
const cacheProductsSearch = searchCache(
    'products',
    searchProductsKeyParameters,
    cacheScopeKey,
    undefined,
    {
        keyValues: searchProductsKeyValues,
        orderedKeyParameters: searchProductsOrderedParameters,
        browserRevalidate: true
    }
);

// POST /products/search — must come before /:id to avoid matching "search" as an id
router.post('/search', previewDraftLanguage, cacheProductsSearch, getProducts);

// GET /products — public
router.get('/', previewDraftLanguage, cacheProductsSearch, getProducts);

/**
 * POST /products — admin only (create). Two keys: `create:Product` for the record itself,
 * `update:Translation` since the same write always carries every language's copy alongside it.
 * Both are required: neither key alone completes this write, which is what stops a rewording
 * from becoming a repricing.
 * `idempotencyKey` after `upload.image()`: multipart fields exist only once multer has parsed them,
 * so the ledger fingerprints the real body. A product with no SKU has no other key, so a retry
 * after a lost answer would put a second live product in the shop.
 */
router.post(
    '/',
    uploadLimiter,
    isAuthOrCredential,
    requirePermission('create', 'Product'),
    requirePermission('update', 'Translation'),
    invalidateCache(['products']),
    upload.image(),
    idempotencyKey,
    createProduct
);

/**
 * GET /products/facets — the filter chips; a static segment, so declared before /:id
 * for the same readability rule the create route follows. `() => true`, not `cacheScopeKey`:
 * `productService.facets()` scopes to active rows UNCONDITIONALLY (see its own comment) — it
 * never reads more for an admin the way search/`:id` do, so every caller already shares one
 * answer and there is nobody to bypass the cache for. `languageNeutral`: categories and tags are
 * counted, not translated, so one entry serves every language.
 */
router.get(
    '/facets',
    setCache(HOUR_SECONDS, {
        tags: ['products'],
        keyParameters: [],
        languageNeutral: true,
        scopeKey: () => true
    }),
    getCatalogFacets
);

// GET /products/:id — public; a holder of `read:Translation` also gets every language
router.get(
    '/:id',
    previewDraftLanguage,
    /**
     * `browserRevalidate`: the server keeps serving from Redis, but a browser must check first (a
     * 304 when nothing changed), because a staff edit clears Redis and no server-side clear can
     * reach a copy already in someone's browser.
     */
    setCache(HOUR_SECONDS, {
        tags: ['products'],
        keyParameters: [],
        scopeKey: cacheScopeKey,
        browserRevalidate: true
    }),
    getProductItem
);

/**
 * PUT /products/:id — replace the product; admin only. Same two keys as the create door:
 * neither key alone completes the write.
 */
router.put(
    '/:id',
    uploadLimiter,
    isAuthOrCredential,
    requirePermission('update', 'Product'),
    requirePermission('update', 'Translation'),
    invalidateCache(['products']),
    upload.image(),
    replaceProduct
);

// PATCH /products/:id — merge the fields sent; the same two keys as the PUT above.
router.patch(
    '/:id',
    uploadLimiter,
    isAuthOrCredential,
    requirePermission('update', 'Product'),
    requirePermission('update', 'Translation'),
    invalidateCache(['products']),
    upload.image(),
    updateProduct
);

// DELETE /products/:id — admin only (soft delete unless ?hardDelete=true)
router.delete(
    '/:id',
    isAuthOrCredential,
    requirePermission('delete', 'Product'),
    invalidateCache(['products']),
    deleteProducts
);

// POST /products/:id/restore — undo a soft delete; a second DELETE never does
router.post(
    '/:id/restore',
    isAuthOrCredential,
    requirePermission('delete', 'Product'),
    invalidateCache(['products']),
    restoreProducts
);

// DELETE /products/:id/hard — the same operation, with the flag spelled in the path
router.delete(
    '/:id/hard',
    isAuthOrCredential,
    requirePermission('delete', 'Product'),
    invalidateCache(['products']),
    routeFlag('hardDelete'),
    deleteProducts
);
