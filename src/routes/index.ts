import express from 'express';
import { getHome } from "../controllers/get-home";
import { getHeavyLoad } from "../controllers/get-heavy-load";
import { getResetDatabase } from "../controllers/get-reset-database";

const router = express.Router();

// GET / — health check
router.get('/', getHome);
router.get('/health', getHome);

// GET /reset-database — seed/reset demo data (dev utility)
router.get('/reset-database', getResetDatabase);

// GET /heavy — CPU-intensive load test
router.get('/heavy', getHeavyLoad);

export default router;
