import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import {
    listProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    searchProducts,
    getProductById,
    updateProductById,
    deleteProductById,
} from '@controllers/products';

const router = Router();

// Apply getAuth to all routes so admins get extra visibility
router.use(getAuth);

// POST /products/search — must come before /:id to avoid matching "search" as an id
router.post('/search', searchProducts);

// GET /products — public
router.get('/', listProducts);

// POST /products — admin only
router.post('/', isAuth, isAdmin, createProduct);

// PUT /products — admin only, id in body
router.put('/', isAuth, isAdmin, updateProduct);

// DELETE /products — admin only, id in body
router.delete('/', isAuth, isAdmin, deleteProduct);

// GET /products/:id — public
router.get('/:id', getProductById);

// PUT /products/:id — admin only
router.put('/:id', isAuth, isAdmin, updateProductById);

// DELETE /products/:id — admin only
router.delete('/:id', isAuth, isAdmin, deleteProductById);

export default router;
