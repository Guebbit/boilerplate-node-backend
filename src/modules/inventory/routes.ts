/**
 * @module
 * Route table for inventory. One `router.use(getAuth, isAuth, isAdmin)` gate covers every route,
 * because every route here is staff's — the customer-facing half of this module is deliberately
 * not a route at all: a shopper learns about stock from `available` on the product they are
 * looking at.
 *
 * See: docs/modules/inventory.md
 */

import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@kernel/middlewares/authorizations';
import { getInventoryLevels } from './controllers/get-inventory-levels';
import { getStockMovements } from './controllers/get-stock-movements';
import { postReceipt } from './controllers/post-receipt';
import { postAdjustment } from './controllers/post-adjustment';
import { postReservationsSweep } from './controllers/post-reservations-sweep';

/** Express router for inventory operations. */
export const router = Router();

/*
 * Every inventory route is staff's, and the customer-facing half of this module is not a route at
 * all: a shopper learns about stock from `available` on the product they are looking at. Exposing
 * the counters or the ledger publicly would tell competitors what sells and tell customers how
 * close they are to missing out, which is a dark pattern when it is true and a lie when it is not.
 */
router.use(getAuth, isAuth, isAdmin);

// GET /inventory/levels — the stock board, scarcest first
router.get('/levels', getInventoryLevels);

// GET /inventory/movements — the ledger, newest first
router.get('/movements', getStockMovements);

// POST /inventory/receipts — a supplier delivery lands
router.post('/receipts', postReceipt);

// POST /inventory/adjustments — a stocktake correction, signed
router.post('/adjustments', postAdjustment);

// POST /inventory/reservations/sweep — the expiry tick; an operator is the cron
router.post('/reservations/sweep', postReservationsSweep);
