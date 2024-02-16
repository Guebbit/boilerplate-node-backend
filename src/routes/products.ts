import express from 'express';
import { isAuth, isAdmin } from "../middlewares/authorizations";

import getAllProducts from "../controllers/products/getAllProducts";
import getTargetProduct from "../controllers/products/getTargetProduct";
import getAddProduct from "../controllers/products/getAddProduct";
import postEditProduct from "../controllers/products/postEditProduct";
import postDeleteProduct from "../controllers/products/postDeleteProduct";

const router = express.Router();

router.get('/', getAllProducts);

// router.get('/details/:productId', getTargetProduct);
//
// router.get('/add', isAuth, isAdmin, getAddProduct);
//
// router.post('/add', isAuth, isAdmin, postEditProduct);
//
// router.get('/edit/:productId', isAuth, isAdmin, getAddProduct);
//
// router.post('/edit/:productId', isAuth, isAdmin, postEditProduct);
//
// router.post('/delete', isAuth, isAdmin, postDeleteProduct);

export default router;
