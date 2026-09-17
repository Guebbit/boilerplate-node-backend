/**
 * @module
 * The payments route table. Everything below the auth wall is authenticated at the router level —
 * money is somebody's. Two routes sit in front of it: the provider's webhook, whose caller is a
 * machine with no account authenticating by signing the raw body instead (session auth on top
 * would only stop deliveries arriving, not make it safer), and `GET /methods`, which is
 * pre-purchase information exactly like `GET /delivery/methods`.
 *
 * Admin-only:    the refund, the offline record, and the RF-reference lookup that precedes it — a
 *                self-service withdrawal, or a self-reported "I paid", if left open to any caller,
 *                versus an intent or confirm locked to admins being a checkout nobody can
 *                complete.
 * Fresh session: every route that moves money requires `requireFreshAuth(REAUTH_TIME_CRITICAL)` —
 *                a stolen access token proves nothing about how recently the holder typed their
 *                password.
 * Verified:      the three routes the customer drives directly also require the `cart.self.checkout`
 *                key — an unproven address must not be able to pay and start receiving payment
 *                mail at an inbox nobody confirmed. `cart` owns the key; `payments` mounts it, the
 *                same as `products/routes.ts` mounts `locales`-owned `translations.*`.
 * Card testing:  `POST /:id/confirm` alone additionally carries the payment-velocity budgets — the
 *                confirm is where a card number is actually validated, `/intent` merely freezes a
 *                price. See `paymentConfirmAttemptLimiter`/`paymentConfirmDeclineLimiter`.
 */

import { Router } from 'express';
import {
    getAuth,
    isAuth,
    requirePermission,
    requireFreshAuth,
    REAUTH_TIME_CRITICAL
} from '@kernel/middlewares/authorizations';
import {
    webhookLimiter,
    paymentConfirmAttemptLimiter,
    paymentConfirmDeclineLimiter,
    paymentDeclineChallengeGate
} from './rate-limits';
import { idempotencyKey } from '@infrastructure/http/middlewares/idempotency';
import { postPaymentIntent } from './controllers/post-payment-intent';
import { postPaymentConfirm } from './controllers/post-payment-confirm';
import { postPaymentSync } from './controllers/post-payment-sync';
import { postPaymentWebhook } from './controllers/post-payment-webhook';
import { getPaymentByOrder } from './controllers/get-payment-by-order';
import { getOrderByReference } from './controllers/get-order-by-reference';
import { postPaymentRefund } from './controllers/post-payment-refund';
import { postPaymentOffline } from './controllers/post-payment-offline';
import { getPaymentMethods } from './controllers/get-payment-methods';

/** Express router for payment operations (intent, confirm, sync, webhook, read back). */
export const router = Router();

// POST /payments/webhook — the provider's own callback. MUST stay above the auth wall below.
// `webhookLimiter`, not `credentialLimiters`: there is no session here to skip a success on.
router.post('/webhook', webhookLimiter, postPaymentWebhook);

// GET /payments/methods — public: which methods are offered is pre-purchase information, same
// reasoning as GET /delivery/methods. MUST stay above the auth wall below.
router.get('/methods', getPaymentMethods);

// Every route from here down requires authentication — money is somebody's.
router.use(getAuth, isAuth);

// POST /payments/intent — freeze an order's price, ready to confirm. idempotencyKey guards a
// retried freeze the same way it guards every other money-moving write below.
router.post(
    '/intent',
    requireFreshAuth(REAUTH_TIME_CRITICAL),
    requirePermission('cart.self.checkout'),
    idempotencyKey,
    postPaymentIntent
);

// GET /payments/order/:orderId — the payment behind an order
router.get('/order/:orderId', getPaymentByOrder);

// GET /payments/order-by-reference — the admin's RF-code lookup, same authority as offline below.
// A literal segment, not `/order/:something`: it names no order yet, that's the whole point of it.
router.get('/order-by-reference', requirePermission('payments.any.create'), getOrderByReference);

// POST /payments/order/:orderId/refund — the operator returns the money, order untouched.
/*
 * No `requireFreshAuth` here: `payments.any.update` carries `stepUp: critical` in
 * `shared/authorization-keys.yaml`, so the guard demands the fresh session and audits that it did.
 * The tier belongs to the ACTION — money leaving the shop — rather than to this one route, and a
 * second route reaching the same key would otherwise have to remember.
 */
router.post(
    '/order/:orderId/refund',
    requirePermission('payments.any.update'),
    idempotencyKey,
    postPaymentRefund
);

// POST /payments/order/:orderId/offline — the admin recording money by hand. Same `stepUp`
// arrangement as the refund: `payments.any.create` carries it in `shared/authorization-keys.yaml`.
router.post(
    '/order/:orderId/offline',
    requirePermission('payments.any.create'),
    idempotencyKey,
    postPaymentOffline
);

// POST /payments/:id/confirm — the payment form's submit. The two velocity limiters and the
// challenge gate sit between the identity guards and idempotencyKey, mirroring where
// `credentialLimiters`/`loginChallengeGate` sit on `POST /account/login`.
router.post(
    '/:id/confirm',
    requireFreshAuth(REAUTH_TIME_CRITICAL),
    requirePermission('cart.self.checkout'),
    paymentConfirmAttemptLimiter,
    paymentConfirmDeclineLimiter,
    paymentDeclineChallengeGate,
    idempotencyKey,
    postPaymentConfirm
);

// POST /payments/:id/sync — the browser reporting it finished at the provider. No idempotencyKey
// here: it is already idempotent by construction, keyed on the provider's own payment reference
// rather than a client-supplied one, so a second sync call settles the same outcome, not a
// second one.
router.post(
    '/:id/sync',
    requireFreshAuth(REAUTH_TIME_CRITICAL),
    requirePermission('cart.self.checkout'),
    postPaymentSync
);
