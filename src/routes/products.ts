import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import { upload } from '@utils/multer';
import { getProducts } from '@controllers/products/get-products';
import { writeProducts } from '@controllers/products/write-products';
import { deleteProducts } from '@controllers/products/delete-products';
import { getProductItem } from '@controllers/products/get-product-item';

export const router = Router();

// Apply getAuth to all routes so admins get extra visibility
router.use(getAuth);

// POST /products/search — must come before /:id to avoid matching "search" as an id
router.post('/search', getProducts);

// GET /products — public
router.get('/', getProducts);

// POST /products — admin only (create)
router.post('/', isAuth, isAdmin, upload.single('imageUpload'), writeProducts);

// PUT /products — admin only, id in body (update)
router.put('/', isAuth, isAdmin, upload.single('imageUpload'), writeProducts);

// DELETE /products — admin only, id in body
router.delete('/', isAuth, isAdmin, deleteProducts);

// GET /products/:id — public
router.get('/:id', getProductItem);

// PUT /products/:id — admin only (update)
router.put('/:id', isAuth, isAdmin, upload.single('imageUpload'), writeProducts);

// DELETE /products/:id — admin only
router.delete('/:id', isAuth, isAdmin, deleteProducts);
