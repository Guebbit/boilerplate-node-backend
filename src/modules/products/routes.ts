import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@kernel/middlewares/authorizations';
import { upload } from '@infrastructure/adapters/storage';
import { getProducts, searchProductsKeyParameters } from './controllers/get-products';
import { writeProducts } from './controllers/write-products';
import { deleteProducts } from './controllers/delete-products';
import { getProductItem } from './controllers/get-product-item';
import { getCatalogueFacets } from './controllers/get-catalogue-facets';
import { invalidateCache, searchCache, setCache } from '@infrastructure/http/middlewares/cache';
import { routeFlag } from '@infrastructure/http/middlewares/route-flag';

/** Express router for product catalogue endpoints (public read, admin write). */
export const router = Router();

// Apply getAuth to all routes so admins get extra visibility
router.use(getAuth);

const cacheProductsSearch = searchCache('products', searchProductsKeyParameters);

// POST /products/search — must come before /:id to avoid matching "search" as an id
router.post('/search', cacheProductsSearch, getProducts);

// GET /products — public
router.get('/', cacheProductsSearch, getProducts);

// POST /products — admin only (create)
router.post(
    '/',
    isAuth,
    isAdmin,
    invalidateCache(['products']),
    upload.single('imageUpload'),
    writeProducts
);

// PUT /products — admin only, id in body (update)
router.put(
    '/',
    isAuth,
    isAdmin,
    invalidateCache(['products']),
    upload.single('imageUpload'),
    writeProducts
);

// DELETE /products — admin only, id in body
router.delete('/', isAuth, isAdmin, invalidateCache(['products']), deleteProducts);

// GET /products/categories — the filter chips; a static segment, so declared before /:id
// for the same readability rule the create route follows
router.get(
    '/categories',
    setCache(3600, { tags: ['products'], keyParameters: [] }),
    getCatalogueFacets
);

// GET /products/:id — public
router.get('/:id', setCache(3600, { tags: ['products'], keyParameters: [] }), getProductItem);

// PUT /products/:id — admin only (update)
router.put(
    '/:id',
    isAuth,
    isAdmin,
    invalidateCache(['products']),
    upload.single('imageUpload'),
    writeProducts
);

// DELETE /products/:id — admin only (soft delete unless ?hardDelete=true)
router.delete('/:id', isAuth, isAdmin, invalidateCache(['products']), deleteProducts);

// DELETE /products/:id/hard — the same operation, with the flag spelled in the path
router.delete(
    '/:id/hard',
    isAuth,
    isAdmin,
    invalidateCache(['products']),
    routeFlag('hardDelete'),
    deleteProducts
);
