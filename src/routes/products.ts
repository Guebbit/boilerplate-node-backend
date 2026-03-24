import express from 'express';
import { isAuth, isAdmin } from "../middlewares/authorizations";

import { pageAllProducts } from "../controllers/products/page-all-products";
import { pageTargetProduct } from "../controllers/products/page-target-product";
import { postCreateProduct, putEditProduct, putEditProductById } from "../controllers/products/post-edit-product";
import { postDeleteProduct, deleteProductById } from "../controllers/products/post-delete-product";
import { postSearchProducts } from "../controllers/products/post-search-products";

const router = express.Router();

// POST /products/search — search products with body filters (must be before /:id)
router.post('/search', postSearchProducts);

// GET /products — list products (paginated, query params)
router.get('/', pageAllProducts);

// POST /products — create a new product (admin only)
router.post('/', isAuth, isAdmin, postCreateProduct);

// PUT /products — update product with id in body (admin only)
router.put('/', isAuth, isAdmin, putEditProduct);

// DELETE /products — delete product with id in body (admin only)
router.delete('/', isAuth, isAdmin, postDeleteProduct);

// GET /products/:id — get a single product
router.get('/:id', pageTargetProduct);

// PUT /products/:id — update a specific product (admin only)
router.put('/:id', isAuth, isAdmin, putEditProductById);

// DELETE /products/:id — delete a specific product (admin only)
router.delete('/:id', isAuth, isAdmin, deleteProductById);

export default router;
