/**
 * @module
 * The stock-alert route table. A request is somebody's own, so the whole router is authenticated
 * and none of it is admin: no permission key, as for the wishlist.
 */

import { Router } from 'express';
import { getAuth, isAuth } from '@kernel/middlewares/authorizations';
import { getStockAlerts } from './controllers/get-stock-alerts';
import { postStockAlerts } from './controllers/post-stock-alerts';
import { deleteStockAlert } from './controllers/delete-stock-alert';

/** Express router for back-in-stock requests (ask, cancel, list). */
export const router = Router();

// All of it requires authentication — signed-in only, so account erase covers the rows.
router.use(getAuth, isAuth);

// GET /stock-alerts
router.get('/', getStockAlerts);

// POST /stock-alerts — ask, the product in the body. Repeating it is the same request.
router.post('/', postStockAlerts);

// DELETE /stock-alerts/:productId — cancel before it is answered.
router.delete('/:productId', deleteStockAlert);
