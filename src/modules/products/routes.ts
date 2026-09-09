/**
 * @module
 * Express router for the product catalogue: public read, admin write, cached where the response
 * does not depend on the caller. Route order matters where a static segment (`/search`,
 * `/categories`) would otherwise be swallowed by `/:id`.
 */

import { Router } from 'express';
import { getAuth, isAuth, requirePermission } from '@kernel/middlewares/authorizations';
import { uploadLimiter } from '@infrastructure/http/middlewares/rate-limit';
import { upload } from '@infrastructure/adapters/storage';
import { getProducts, searchProductsKeyParameters } from './controllers/get-products';
import { createProduct } from './controllers/create-product';
import { updateProduct } from './controllers/update-product';
import { deleteProducts } from './controllers/delete-products';
import { getProductItem } from './controllers/get-product-item';
import { getProductAdmin } from './controllers/get-product-admin';
import { getCatalogueFacets } from './controllers/get-catalogue-facets';
import { invalidateCache, searchCache, setCache } from '@infrastructure/http/middlewares/cache';
import { routeFlag } from '@infrastructure/http/middlewares/route-flag';

/** Express router for product catalogue endpoints (public read, admin write). */
export const router = Router();

// Apply getAuth to all routes so admins get extra visibility
router.use(getAuth);

/** Shared cache middleware for both search entry points, keyed on the query parameters that change the answer. */
const cacheProductsSearch = searchCache('products', searchProductsKeyParameters);

// POST /products/search — must come before /:id to avoid matching "search" as an id
router.post('/search', cacheProductsSearch, getProducts);

// GET /products — public
router.get('/', cacheProductsSearch, getProducts);

// POST /products — admin only (create). Two keys: `products.create` for the record itself,
// `translations.manage` since the same write always carries every language's copy alongside it.
router.post(
    '/',
    uploadLimiter,
    isAuth,
    requirePermission('products.create'),
    requirePermission('translations.manage'),
    invalidateCache(['products']),
    upload.single('imageUpload'),
    createProduct
);

// DELETE /products — admin only, id in body
router.delete(
    '/',
    isAuth,
    requirePermission('products.delete'),
    invalidateCache(['products']),
    deleteProducts
);

// GET /products/categories — the filter chips; a static segment, so declared before /:id
// for the same readability rule the create route follows
router.get(
    '/categories',
    setCache(3600, { tags: ['products'], keyParameters: [] }),
    getCatalogueFacets
);

// GET /products/:id — public
router.get('/:id', setCache(3600, { tags: ['products'], keyParameters: [] }), getProductItem);

// PATCH /products/:id — admin only (update, merging). Same two keys as the create door.
router.patch(
    '/:id',
    uploadLimiter,
    isAuth,
    requirePermission('products.update'),
    requirePermission('translations.manage'),
    invalidateCache(['products']),
    upload.single('imageUpload'),
    updateProduct
);

// GET /products/:id/admin — admin only, every language at once. Never cached: the screen someone
// is actively editing, the same reasoning `GET /locales/:locale/entries` already applies.
router.get(
    '/:id/admin',
    isAuth,
    requirePermission('products.update'),
    requirePermission('translations.read'),
    getProductAdmin
);

// DELETE /products/:id — admin only (soft delete unless ?hardDelete=true)
router.delete(
    '/:id',
    isAuth,
    requirePermission('products.delete'),
    invalidateCache(['products']),
    deleteProducts
);

// DELETE /products/:id/hard — the same operation, with the flag spelled in the path
router.delete(
    '/:id/hard',
    isAuth,
    requirePermission('products.delete'),
    invalidateCache(['products']),
    routeFlag('hardDelete'),
    deleteProducts
);
