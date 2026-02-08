import express from 'express';
import { isAuth, isAdmin } from "../middlewares/authorizations";
import multer from "../utils/multer";
import { csrfSynchronisedProtection } from "../middlewares/csrf";

import { getAllProducts } from "../controllers/products/get-all-products";
import { getTargetProduct } from "../controllers/products/get-target-product";
import { getEditProduct } from "../controllers/products/get-edit-product";
import { postEditProduct } from "../controllers/products/post-edit-product";
import { postDeleteProduct } from "../controllers/products/post-delete-product";

const router = express.Router();

router.get('/details/:productId', getTargetProduct);

router.get('/add', isAuth, isAdmin, getEditProduct);

router.post('/add', isAuth, isAdmin, multer.single('imageUpload'), csrfSynchronisedProtection, postEditProduct);

router.get('/edit/:productId', isAuth, isAdmin, getEditProduct);

router.post('/edit/:productId', isAuth, isAdmin, multer.single('imageUpload'), csrfSynchronisedProtection, postEditProduct);

router.post('/delete', isAuth, isAdmin, csrfSynchronisedProtection, postDeleteProduct);

router.get('/:page', getAllProducts);

router.get('/', getAllProducts);

export default router;
