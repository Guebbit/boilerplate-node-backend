/**
 * @module
 * Express router for the product catalogue: public read, admin write, cached where the response
 * does not depend on the caller. Route order matters where a static segment (`/search`,
 * `/categories`, `/settings`) would otherwise be swallowed by `/:id`.
 */

import type { Request } from 'express';
import { Router } from 'express';
import { getAuth, isAuthOrCredential, requirePermission } from '@kernel/middlewares/authorizations';
import { uploadLimiter } from '@infrastructure/http/middlewares/rate-limit';
import { upload } from '@infrastructure/http/middlewares/upload';
import { getProducts, searchProductsKeyParameters } from './controllers/get-products';
import { createProduct } from './controllers/create-product';
import { replaceProduct, updateProduct } from './controllers/update-product';
import { deleteProducts } from './controllers/delete-products';
import { restoreProducts } from './controllers/restore-products';
import { getProductItem } from './controllers/get-product-item';
import { getProductAdmin } from './controllers/get-product-admin';
import { getCatalogueFacets } from './controllers/get-catalogue-facets';
import { getProductSettings } from './controllers/get-product-settings';
import { invalidateCache, searchCache, setCache } from '@infrastructure/http/middlewares/cache';
import { routeFlag } from '@infrastructure/http/middlewares/route-flag';
import { hasAnonymousReadScope } from '@kernel/access/query';
import { callerScope } from './services';

/** Express router for product catalogue endpoints (public read, admin write). */
export const router = Router();

/*
 * `getAuth` on everything, no identity guard here: the reads below are a storefront and must
 * answer an anonymous browser. Each write names its own guard instead, and that guard is
 * `isAuthOrCredential` — catalogue writes are `products.any.*`/`translations.any.*` keys over
 * the tenant's own data, so a PIM or a supplier feed may hold them. See
 * docs/tools/security.md#machine-to-machine-credentials.
 */
router.use(getAuth);

/**
 * A caller who reads exactly what a guest reads shares the guest's cached entry; a caller who
 * sees more (admins — inactive products included) bypasses Redis entirely rather than risk
 * serving or storing their wider answer under that shared key. `hasAnonymousReadScope` is what
 * makes this safe BY CONSTRUCTION — see its own docblock.
 */
const cacheScopeKey = (request: Request): boolean =>
    hasAnonymousReadScope(callerScope, request.caller);

/**
 * Shared cache middleware for both search entry points, keyed on the query parameters that
 * change the answer.
 */
const cacheProductsSearch = searchCache('products', searchProductsKeyParameters, cacheScopeKey);

// POST /products/search — must come before /:id to avoid matching "search" as an id
router.post('/search', cacheProductsSearch, getProducts);

// GET /products — public
router.get('/', cacheProductsSearch, getProducts);

// POST /products — admin only (create). Two keys: `products.any.create` for the record itself,
// `translations.any.update` since the same write always carries every language's copy alongside it.
// Both are required: neither key alone completes this write, which is what stops a rewording
// from becoming a repricing.
router.post(
    '/',
    uploadLimiter,
    isAuthOrCredential,
    requirePermission('products.any.create'),
    requirePermission('translations.any.update'),
    invalidateCache(['products']),
    upload.image(),
    createProduct
);

// DELETE /products — admin only, id in body
router.delete(
    '/',
    isAuthOrCredential,
    requirePermission('products.any.delete'),
    invalidateCache(['products']),
    deleteProducts
);

// GET /products/categories — the filter chips; a static segment, so declared before /:id
// for the same readability rule the create route follows. `() => true`, not `cacheScopeKey`:
// `productService.facets()` scopes to active rows UNCONDITIONALLY (see its own comment) — it
// never reads more for an admin the way search/`:id` do, so every caller already shares one
// answer and there is nobody to bypass the cache for.
router.get(
    '/categories',
    setCache(3600, { tags: ['products'], keyParameters: [], scopeKey: () => true }),
    getCatalogueFacets
);

// GET /products/settings — the shop's currency; static, so before /:id. Uncached: it is one env
// read, cheaper than the cache lookup that would guard it.
router.get('/settings', getProductSettings);

// GET /products/:id — public
router.get(
    '/:id',
    // `browserRevalidate`: the server keeps serving from Redis, but a browser must check first (a
    // 304 when nothing changed), because the page shows `available`, which a stock write changes
    // and no server-side clear can reach in someone's browser.
    setCache(3600, {
        tags: ['products'],
        keyParameters: [],
        scopeKey: cacheScopeKey,
        browserRevalidate: true
    }),
    getProductItem
);

// PUT /products/:id — replace the product; admin only. Same two keys as the create door:
// neither key alone completes the write.
router.put(
    '/:id',
    uploadLimiter,
    isAuthOrCredential,
    requirePermission('products.any.update'),
    requirePermission('translations.any.update'),
    invalidateCache(['products']),
    upload.image(),
    replaceProduct
);

// PATCH /products/:id — merge the fields sent; the same two keys as the PUT above.
router.patch(
    '/:id',
    uploadLimiter,
    isAuthOrCredential,
    requirePermission('products.any.update'),
    requirePermission('translations.any.update'),
    invalidateCache(['products']),
    upload.image(),
    updateProduct
);

// GET /products/:id/admin — admin only, every language at once. Never cached: the screen someone
// is actively editing, the same reasoning `GET /locales/:locale/entries` already applies.
router.get(
    '/:id/admin',
    isAuthOrCredential,
    requirePermission('products.any.update'),
    requirePermission('translations.any.read'),
    getProductAdmin
);

// DELETE /products/:id — admin only (soft delete unless ?hardDelete=true)
router.delete(
    '/:id',
    isAuthOrCredential,
    requirePermission('products.any.delete'),
    invalidateCache(['products']),
    deleteProducts
);

// POST /products/:id/restore — undo a soft delete; a second DELETE never does
router.post(
    '/:id/restore',
    isAuthOrCredential,
    requirePermission('products.any.delete'),
    invalidateCache(['products']),
    restoreProducts
);

// DELETE /products/:id/hard — the same operation, with the flag spelled in the path
router.delete(
    '/:id/hard',
    isAuthOrCredential,
    requirePermission('products.any.delete'),
    invalidateCache(['products']),
    routeFlag('hardDelete'),
    deleteProducts
);
