import express from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';

import { listProducts, getProduct, createProduct, updateProduct, deleteProduct } from '@controllers/api/products';

const router = express.Router();

// Populate req.user from JWT token (optional auth — public can browse products)
router.use(getAuth);

// GET /products — list products (public; admin sees all including inactive)
router.get('/', listProducts);

// GET /products/:id — get a single product
router.get('/:id', getProduct);

// POST /products — create a new product (admin only)
router.post('/', isAuth, isAdmin, createProduct);

// PUT /products/:id — update a product (admin only)
router.put('/:id', isAuth, isAdmin, updateProduct);

// DELETE /products/:id — delete a product (admin only)
router.delete('/:id', isAuth, isAdmin, deleteProduct);

export default router;

