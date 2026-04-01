import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import multer from '@utils/multer';
import getProducts from '@controllers/products/get-products';
import postProducts from '@controllers/products/post-products';
import putProducts from '@controllers/products/put-products';
import deleteProducts from '@controllers/products/delete-products';
import postProductsSearch from '@controllers/products/post-products-search';
import getProductItem from '@controllers/products/get-product-item';
import putProductItem from '@controllers/products/put-product-item';
import deleteProductItem from '@controllers/products/delete-product-item';

const router = Router();

// Apply getAuth to all routes so admins get extra visibility
router.use(getAuth);

// POST /products/search — must come before /:id to avoid matching "search" as an id
router.post('/search', postProductsSearch);

// GET /products — public
router.get('/', getProducts);

// POST /products — admin only
router.post('/', isAuth, isAdmin, multer.single('imageUpload'), postProducts);

// PUT /products — admin only, id in body
router.put('/', isAuth, isAdmin, multer.single('imageUpload'), putProducts);

// DELETE /products — admin only, id in body
router.delete('/', isAuth, isAdmin, deleteProducts);

// GET /products/:id — public
router.get('/:id', getProductItem);

// PUT /products/:id — admin only
router.put('/:id', isAuth, isAdmin, multer.single('imageUpload'), putProductItem);

// DELETE /products/:id — admin only
router.delete('/:id', isAuth, isAdmin, deleteProductItem);

export default router;
