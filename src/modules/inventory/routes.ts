/**
 * @module
 * Route table for inventory. Every route is staff's — the customer-facing half of this module is
 * deliberately not a route at all: a shopper learns about stock from `available` on the product
 * they are looking at — but not every route needs the same key: `manager` reads levels without
 * moving stock, `warehouse` moves stock through `inventory.create`.
 *
 * See: docs/modules/inventory.md
 */

import { Router } from 'express';
import { getAuth, isAuth, requirePermission } from '@kernel/middlewares/authorizations';
import { getInventoryLevels } from './controllers/get-inventory-levels';
import { getStockMovements } from './controllers/get-stock-movements';
import { postReceipt } from './controllers/post-receipt';
import { postAdjustment } from './controllers/post-adjustment';
import { postReservationsSweep } from './controllers/post-reservations-sweep';

/** Express router for inventory operations. */
export const router = Router();

/*
 * Exposing the counters or ledger publicly would tell competitors what sells and tell customers
 * how close they are to missing out — a dark pattern when true, a lie when not.
 */
router.use(getAuth, isAuth);

// GET /inventory/levels — the stock board, scarcest first
router.get('/levels', requirePermission('inventory.read'), getInventoryLevels);

// GET /inventory/movements — the ledger, newest first
router.get('/movements', requirePermission('inventory.read'), getStockMovements);

// POST /inventory/receipts — a supplier delivery lands. `inventory.create`: the key stock never
// moves without — see `shared/authorization-keys.yaml`.
router.post('/receipts', requirePermission('inventory.create'), postReceipt);

// POST /inventory/adjustments — a stocktake correction, signed
router.post('/adjustments', requirePermission('inventory.create'), postAdjustment);

// POST /inventory/reservations/sweep — the expiry tick; an operator is the cron, running as
// `SYSTEM_ACTOR`, which is unrestricted in the shop — kept on the wide key since no preset role
// is meant to reach it directly.
router.post('/reservations/sweep', requirePermission('inventory.manage'), postReservationsSweep);
