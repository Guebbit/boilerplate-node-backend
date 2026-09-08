/**
 * @module
 * The payments route table. Everything below the auth wall is authenticated at the router level —
 * money is somebody's. The ONE route in front of it is the provider's webhook: its caller is a
 * machine with no account, authenticating by signing the raw body instead — session auth on top
 * would only stop deliveries arriving, not make it safer.
 *
 * Admin-only:    the refund alone — a self-service withdrawal if left open to any caller, versus
 *                an intent or confirm locked to admins being a checkout nobody can complete.
 * Fresh session: every route that moves money requires `requireFreshAuth(REAUTH_TIME_CRITICAL)` —
 *                a stolen access token proves nothing about how recently the holder typed their
 *                password.
 * Verified:      the two routes the customer drives directly also require `requireVerified` — an
 *                unproven address must not be able to pay and start receiving payment mail at an
 *                inbox nobody confirmed.
 */

import { Router } from 'express';
import {
    getAuth,
    isAuth,
    requirePermission,
    requireFreshAuth,
    requireVerified,
    REAUTH_TIME_CRITICAL
} from '@kernel/middlewares/authorizations';
import { webhookLimiter } from '@infrastructure/http/middlewares/rate-limit';
import { postPaymentIntent } from './controllers/post-payment-intent';
import { postPaymentConfirm } from './controllers/post-payment-confirm';
import { postPaymentSync } from './controllers/post-payment-sync';
import { postPaymentWebhook } from './controllers/post-payment-webhook';
import { getPaymentByOrder } from './controllers/get-payment-by-order';
import { postPaymentRefund } from './controllers/post-payment-refund';

/** Express router for payment operations (intent, confirm, sync, webhook, read back). */
export const router = Router();

// POST /payments/webhook — the provider's own callback. MUST stay above the auth wall below.
// `webhookLimiter`, not `credentialLimiters`: there is no session here to skip a success on.
router.post('/webhook', webhookLimiter, postPaymentWebhook);

// Every route from here down requires authentication — money is somebody's.
router.use(getAuth, isAuth);

// POST /payments/intent — freeze an order's price, ready to confirm.
router.post('/intent', requireFreshAuth(REAUTH_TIME_CRITICAL), requireVerified, postPaymentIntent);

// GET /payments/order/:orderId — the payment behind an order
router.get('/order/:orderId', getPaymentByOrder);

// POST /payments/order/:orderId/refund — the operator returns the money, order untouched.
/*
 * No `requireFreshAuth` here: `payments.update` carries `stepUp: critical` in
 * `shared/authorization-keys.yaml`, so the guard demands the fresh session and audits that it did.
 * The tier belongs to the ACTION — money leaving the shop — rather than to this one route, and a
 * second route reaching the same key would otherwise have to remember.
 */
router.post('/order/:orderId/refund', requirePermission('payments.update'), postPaymentRefund);

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
