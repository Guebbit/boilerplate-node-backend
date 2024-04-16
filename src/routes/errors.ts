import express from 'express';

import get404 from "../controllers/errors/get-not-found";
import getCustom from "../controllers/errors/get-custom";

const router = express.Router();

router.get('/page-not-found', get404);

router.get('/', getCustom);

export default router;
