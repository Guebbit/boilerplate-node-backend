/**
 * @module
 * The payments route table. Everything below the auth wall is authenticated at the router level —
 * money is somebody's. The ONE route in front of it is the provider's webhook: its caller is a
 * machine with no account, which authenticates by signing the raw body instead. Adding session
 * auth on top of that would not make it safer, it would only stop the deliveries arriving.
 *
 * Exactly one route is additionally admin-only: the refund, a self-service withdrawal if
 * left open to any caller, versus an intent or confirm locked to admins being a checkout nobody
 * can complete. Every route that moves money also requires a FRESH session
 * (`requireFreshAuth(REAUTH_TIME_CRITICAL)`) — a stolen access token
 * proves nothing about how recently the account holder actually typed their password — and, on
 * the two the customer themselves drives, a VERIFIED one (`requireVerified`): an unproven address
 * must not be able to pay and start receiving payment mail at an inbox nobody confirmed.
 */

import { Router } from 'express';
import {
    getAuth,
    isAuth,
    isAdmin,
    requireFreshAuth,
    requireVerified,
    REAUTH_TIME_CRITICAL
} from '@kernel/middlewares/authorizations';
import { postPaymentIntent } from './controllers/post-payment-intent';
import { postPaymentConfirm } from './controllers/post-payment-confirm';
import { postPaymentSync } from './controllers/post-payment-sync';
import { postPaymentWebhook } from './controllers/post-payment-webhook';
import { getPaymentByOrder } from './controllers/get-payment-by-order';
import { postPaymentRefund } from './controllers/post-payment-refund';

/** Express router for payment operations (intent, confirm, sync, webhook, read back). */
export const router = Router();

// POST /payments/webhook — the provider's own callback. MUST stay above the auth wall below.
router.post('/webhook', postPaymentWebhook);

// Every route from here down requires authentication — money is somebody's.
router.use(getAuth, isAuth);

// POST /payments/intent — freeze an order's price, ready to confirm.
router.post('/intent', requireFreshAuth(REAUTH_TIME_CRITICAL), requireVerified, postPaymentIntent);

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

// POST /payments/:id/confirm — the payment form's submit.
router.post(
    '/:id/confirm',
    requireFreshAuth(REAUTH_TIME_CRITICAL),
    requireVerified,
    postPaymentConfirm
);

// POST /payments/:id/sync — the browser reporting it finished at the provider. Same guards as the
// confirm: it settles money just as the confirm does, only from the provider's answer rather than
// from a method the caller supplied.
router.post('/:id/sync', requireFreshAuth(REAUTH_TIME_CRITICAL), requireVerified, postPaymentSync);
