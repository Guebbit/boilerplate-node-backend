/**
 * @module
 * Route table for inventory. Every route is staff's — the customer-facing half of this module is
 * deliberately not a route at all: a shopper learns about stock from `available` on the product
 * they are looking at — but not every route needs the same key: `manager` reads levels without
 * moving stock, `warehouse` moves stock through `create:StockMovement`.
 *
 * See: docs/modules/inventory.md
 */

import { Router } from 'express';
import { getAuth, isAuthOrCredential, requirePermission } from '@kernel/middlewares/authorizations';
import { idempotencyKey } from '@infrastructure/http/middlewares/idempotency';
import { getInventoryLevels } from './controllers/get-inventory-levels';
import { getStockMovements } from './controllers/get-stock-movements';
import { getPreorderLevels } from './controllers/get-preorder-levels';
import { putPreorderLimit } from './controllers/put-preorder-limit';
import { postReceipt } from './controllers/post-receipt';
import { postAdjustment } from './controllers/post-adjustment';
import { postReservationsSweep } from './controllers/post-reservations-sweep';

/** Express router for inventory operations. */
export const router = Router();

/*
 * Exposing the counters or ledger publicly would tell competitors what sells and tell customers
 * how close they are to missing out — a dark pattern when true, a lie when not.
 *
 * `isAuthOrCredential`, not `isAuth`: an `sk_...` api key may reach this module. Stock levels,
 * receipts and adjustments are the surface a warehouse system talks to, and the clearest
 * machine-to-machine case in the app.
 */
router.use(getAuth, isAuthOrCredential);

// GET /inventory/levels — the stock board, scarcest first
router.get('/levels', requirePermission('read', 'StockLevel'), getInventoryLevels);

// GET /inventory/preorders — the preorder board: allowance, outstanding, paid vs unpaid
router.get('/preorders', requirePermission('read', 'StockLevel'), getPreorderLevels);

// PUT /inventory/levels/:productId/preorder-limit — how many units may be preordered at once.
// `create:StockMovement`, the warehouse's own key: it is a promise about stock that does not exist
// yet, and absolute, so a retried request is harmless without an idempotency key.
router.put(
    '/levels/:productId/preorder-limit',
    requirePermission('create', 'StockMovement'),
    putPreorderLimit
);

// GET /inventory/movements — the ledger, newest first
router.get('/movements', requirePermission('read', 'StockLevel'), getStockMovements);

// POST /inventory/receipts — a supplier delivery lands. `create:StockMovement`: the key stock never
// moves without — see `shared/authorization-keys.yaml`. `idempotencyKey`: a retried receipt must
// replay, not count the delivery twice.
router.post('/receipts', requirePermission('create', 'StockMovement'), idempotencyKey, postReceipt);

// POST /inventory/adjustments — a stocktake correction, signed. Same replay guard as receipts:
// a retried delta applied twice is a wrong stock count.
router.post(
    '/adjustments',
    requirePermission('create', 'StockMovement'),
    idempotencyKey,
    postAdjustment
);

// POST /inventory/reservations/sweep — the expiry tick's on-demand door. `npm run
// sweep:reservations` (`docker/crontab`) is the actual schedule, calling `runReservationSweep`
// in-process and never reaching this route at all; this is for an operator, or a platform
// scheduler that prefers HTTP over a cron container. `sweep`, not `manage`: no preset role is
// meant to reach it directly, and CRUD has no verb for "clear expired holds on demand" — see
// `shared/authorization-keys.yaml`.
router.post('/reservations/sweep', requirePermission('sweep', 'StockLevel'), postReservationsSweep);
