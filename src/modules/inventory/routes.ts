import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@kernel/middlewares/authorizations';
import { getStockMovements } from './controllers/get-stock-movements';
import { postRestock } from './controllers/post-restock';

/** Express router for inventory operations (the ledger and the restock). */
export const router = Router();

// All inventory routes are staff's — customers see stock as a number on the product page.
router.use(getAuth, isAuth, isAdmin);

// GET /inventory/movements — the ledger, newest first
router.get('/movements', getStockMovements);

// POST /inventory/restock — units arrive on a shelf
router.post('/restock', postRestock);
