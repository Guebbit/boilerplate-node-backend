import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@kernel/middlewares/authorizations';
import { upload } from '@infrastructure/adapters/storage';
import { getProducts, searchProductsKeyParameters } from './controllers/get-products';
import { writeProducts } from './controllers/write-products';
import { deleteProducts } from './controllers/delete-products';
import { getProductItem } from './controllers/get-product-item';
import { invalidateCache, setCache } from '@infrastructure/http/middlewares/cache';
import { routeFlag } from '@infrastructure/http/middlewares/route-flag';

/** Express router for product catalogue endpoints (public read, admin write). */
export const router = Router();

// Apply getAuth to all routes so admins get extra visibility
router.use(getAuth);

// POST /products/search — must come before /:id to avoid matching "search" as an id
router.post('/search', getProducts);

// GET /products — public
router.get(
    '/',
    setCache(3600, { tags: ['products'], keyParameters: searchProductsKeyParameters }),
    getProducts
);

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
