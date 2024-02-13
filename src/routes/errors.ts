import express from 'express';

import get404product from "../controllers/errors/get404product";
import get404 from "../controllers/errors/get404";
import get500 from "../controllers/errors/get500";

const router = express.Router();

router.get('/product-not-found', get404product);

router.get('/page-not-found', get404);

router.get('/unknown', get500);

router.get('/csrf', get500);

export default router;
