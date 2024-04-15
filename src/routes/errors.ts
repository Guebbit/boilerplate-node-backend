import express from 'express';

import get404 from "../controllers/errors/get404";
import getCustom from "../controllers/errors/getCustom";

const router = express.Router();

router.get('/page-not-found', get404);

router.get('/', getCustom);

export default router;
