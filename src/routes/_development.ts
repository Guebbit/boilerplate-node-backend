import express from 'express';
import { getHeavyLoad } from '@controllers/_development/get-heavy-load';
import { getResetDatabase } from '@controllers/_development/get-reset-database';

const router = express.Router();

router.get('/reset-database', getResetDatabase);

router.get('/heavy', getHeavyLoad);

export { router as developmentRoutes };
