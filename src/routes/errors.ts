import express from 'express';

import { getNotFound } from "../controllers/errors/get-not-found";
import { getCustomError } from "../controllers/errors/get-custom";

const router = express.Router();

router.get('/page-not-found', getNotFound);

router.get('/', getCustomError);

export default router;
