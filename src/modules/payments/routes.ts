import { Router } from 'express';
import { getAuth, isAuth } from '@kernel/middlewares/authorizations';
import { postPaymentIntent } from './controllers/post-payment-intent';
import { postPaymentConfirm } from './controllers/post-payment-confirm';
import { getPaymentByOrder } from './controllers/get-payment-by-order';

/** Express router for payment operations (intent, confirm, read back). */
export const router = Router();

// All payment routes require authentication — money is somebody's.
router.use(getAuth, isAuth);

// POST /payments/intent — freeze an order's price, ready to confirm
router.post('/intent', postPaymentIntent);

// GET /payments/order/:orderId — the payment behind an order
router.get('/order/:orderId', getPaymentByOrder);

// POST /payments/:id/confirm — the card dialog's submit
router.post('/:id/confirm', postPaymentConfirm);
