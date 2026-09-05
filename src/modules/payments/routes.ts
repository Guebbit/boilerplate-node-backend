/**
 * @module
 * The payments route table. Everything is authenticated at the router level — money is somebody's
 * — and exactly one route is additionally admin-only: the refund, a self-service withdrawal if
 * left open to any caller, versus an intent or confirm locked to admins being a checkout nobody
 * can complete. Every route that moves money also requires a FRESH session
 * (`requireFreshAuth(REAUTH_TIME_CRITICAL)`) — a stolen access token
 * proves nothing about how recently the account holder actually typed their password.
 */

import { Router } from 'express';
import {
    getAuth,
    isAuth,
    isAdmin,
    requireFreshAuth,
    REAUTH_TIME_CRITICAL
} from '@kernel/middlewares/authorizations';
import { postPaymentIntent } from './controllers/post-payment-intent';
import { postPaymentConfirm } from './controllers/post-payment-confirm';
import { getPaymentByOrder } from './controllers/get-payment-by-order';
import { postPaymentRefund } from './controllers/post-payment-refund';

/** Express router for payment operations (intent, confirm, read back). */
export const router = Router();

// All payment routes require authentication — money is somebody's.
router.use(getAuth, isAuth);

// POST /payments/intent — freeze an order's price, ready to confirm.
router.post('/intent', requireFreshAuth(REAUTH_TIME_CRITICAL), postPaymentIntent);

// GET /payments/order/:orderId — the payment behind an order
router.get('/order/:orderId', getPaymentByOrder);

// POST /payments/order/:orderId/refund — the operator returns the money, order untouched.
// requireFreshAuth AFTER isAdmin: an admin session moving money out is worth more, not less.
router.post(
    '/order/:orderId/refund',
    isAdmin,
    requireFreshAuth(REAUTH_TIME_CRITICAL),
    postPaymentRefund
);

// POST /payments/:id/confirm — the card dialog's submit.
router.post('/:id/confirm', requireFreshAuth(REAUTH_TIME_CRITICAL), postPaymentConfirm);
