/**
 * @module
 * Express router for invoicing's two download routes — mounted at `/orders`, shared with `orders`'
 * own router (see `./module.ts` and `docs/api/contract-fragmentation.md`'s `account`/`addresses`
 * precedent). `getAuth` returns early when a request already carries a resolved auth context, so
 * mounting it here too costs nothing beyond the first router that ran.
 *
 * `/:id/invoice` and `/:id/credit-note` both have two path segments, so neither ever collides with
 * `orders`' own `/:id` (one segment) regardless of which router runs first.
 */

import { Router } from 'express';
import { getAuth, isAuth } from '@kernel/middlewares/authorizations';
import { getOrderInvoice } from './controllers/get-order-invoice';
import { getOrderCreditNote } from './controllers/get-order-credit-note';
import { invoicingLimiter } from './rate-limits';

/** Express router for invoicing's download routes. */
export const router = Router();

router.use(getAuth, isAuth);

// GET /orders/:id/invoice — not cached: every hit renders fresh, and caching PDF bytes as a
// JSON-cache value would only ever hold the first byte range express actually flushed.
// `invoicingLimiter` guards the Chromium launch every render spawns.
router.get('/:id/invoice', invoicingLimiter, getOrderInvoice);

// GET /orders/:id/credit-note — same reasoning as the invoice route above.
router.get('/:id/credit-note', invoicingLimiter, getOrderCreditNote);
