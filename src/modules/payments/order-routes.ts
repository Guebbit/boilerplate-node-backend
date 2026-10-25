/**
 * @module
 * The payments doors that sit under `/orders`: `GET /orders/{id}/payments` (the order's payment)
 * and `POST /orders/{id}/payments`, an operator recording money the provider never saw. The payment is a child of the order in the URL (Solidus'
 * `POST /api/orders/{number}/payments`); the module and its `create:Payment` key stay payments'.
 * Mounted at `/orders` by `./module.ts`.
 */

import { Router } from 'express';
import { getAuth, isAuth, requirePermission } from '@kernel/middlewares/authorizations';
import { idempotencyKey } from '@infrastructure/http/middlewares/idempotency';
import { postOrderPayment } from './controllers/post-order-payment';
import { getOrderPayments } from './controllers/get-order-payments';

/** Express router for the payment operations that live under an order. */
export const orderRouter = Router();

// GET /orders/:id/payments — the order's payment, if one was started; the service scopes it.
orderRouter.get('/:id/payments', getAuth, isAuth, getOrderPayments);

// POST /orders/:id/payments — the admin recording money by hand. Same `stepUp` arrangement as the
// refund: `create:Payment` carries it in `shared/authorization-keys.yaml`.
orderRouter.post(
    '/:id/payments',
    getAuth,
    isAuth,
    requirePermission('create', 'Payment'),
    idempotencyKey,
    postOrderPayment
);
