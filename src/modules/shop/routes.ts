/**
 * @module
 * Route table for shop: one public read. Nothing here writes, and the answer changes only with a
 * redeploy, so it is bounded by the global burst brake alone.
 */

import { Router } from 'express';
import { getShop } from './controllers/get-shop';

/** Express router for shop endpoints. */
export const router = Router();

// GET /shop — the shop's identity, currency, ship-to countries and return address.
router.get('/', getShop);
