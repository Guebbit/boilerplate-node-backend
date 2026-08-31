/**
 * @module
 * The payments route table.
 *
 * Everything is authenticated at the router level — money is somebody's — and exactly one route
 * is additionally admin-only: the refund. That asymmetry is the whole file. A refund open to any
 * logged-in caller is a self-service withdrawal; an intent or a confirm locked to admins is a
 * checkout nobody can complete.
 */

import { Router } from 'express';
import { getAuth, isAuth, isAdmin } from '@kernel/middlewares/authorizations';
import { postPaymentIntent } from './controllers/post-payment-intent';
import { postPaymentConfirm } from './controllers/post-payment-confirm';
import { getPaymentByOrder } from './controllers/get-payment-by-order';
import { postPaymentRefund } from './controllers/post-payment-refund';

/** Express router for payment operations (intent, confirm, read back). */
export const router = Router();

// All payment routes require authentication — money is somebody's.
router.use(getAuth, isAuth);

// POST /payments/intent — freeze an order's price, ready to confirm
router.post('/intent', postPaymentIntent);

// GET /payments/order/:orderId — the payment behind an order
router.get('/order/:orderId', getPaymentByOrder);

// POST /payments/order/:orderId/refund — the operator returns the money, order untouched
router.post('/order/:orderId/refund', isAdmin, postPaymentRefund);

// POST /payments/:id/confirm — the card dialog's submit
router.post('/:id/confirm', postPaymentConfirm);
