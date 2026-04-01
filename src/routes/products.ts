import express from 'express';
import { isAuth, isAdmin } from '@middlewares/authorizations';
import multer from '@utils/multer';
import { csrfSynchronisedProtection } from '@middlewares/csrf';

import { pageAllProducts } from '@controllers/products/page-all-products';
import { pageTargetProduct } from '@controllers/products/page-target-product';
import { pageEditProduct } from '@controllers/products/page-edit-product';
import { postCreateProduct } from '@controllers/products/post-create-product';
import { postDeleteProduct } from '@controllers/products/post-delete-product';

const router = express.Router();

router.get('/details/:productId', pageTargetProduct);

router.get('/add', isAuth, isAdmin, pageEditProduct);

router.post(
    '/add',
    isAuth,
    isAdmin,
    multer.single('imageUpload'),
    csrfSynchronisedProtection,
    postCreateProduct
);

router.get('/edit/:productId', isAuth, isAdmin, pageEditProduct);

router.post(
    '/edit/:productId',
    isAuth,
    isAdmin,
    multer.single('imageUpload'),
    csrfSynchronisedProtection,
    postCreateProduct
);

router.post('/delete', isAuth, isAdmin, csrfSynchronisedProtection, postDeleteProduct);

router.get('/:page', pageAllProducts);

router.get('/', pageAllProducts);

export default router;
