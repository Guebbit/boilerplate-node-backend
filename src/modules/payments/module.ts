/**
 * @module
 * Payments: an order's money, behind a provider port (`./providers`), so the generic part of
 * taking money can be bought rather than built. Depends on orders (a payment freezes an order's
 * total and refunds answer `ORDER_CANCELLED`) and on inventory (the confirm commits an order's
 * held stock into a sale). Depends on users to resolve the payer, and to detach one on
 * `USER_DELETED` — the payment survives account erasure, same as the order it paid for.
 *
 * See: docs/modules/payments.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import type { ExportPayment } from '@types';
import { onDomainEvent } from '@kernel/events';
import { ORDER_CANCELLED } from '@modules/orders';
import { USER_DELETED } from '@modules/users';
import { router } from './routes';
import { refundForOrder, detachUserId, findOwnPayments } from './services';
import { validateBankTransferConfig } from './config';
import { paymentsRateLimits } from './rate-limits';
import { checkSelector } from '@kernel/required-config';
import { resolvePaymentProvider } from './providers';
// Installs this module's event declarations (PAYMENT_SUCCEEDED, PAYMENT_FAILED).
import './events';

/**
 * {@link ExportPayment}, built from the real document — minus `userId`: already scoped to the
 * caller by the query that found it, so naming their own id back to them adds nothing. A real
 * plain object, not a type-level `Omit` on the Mongoose document — `applyPaymentTransform` carries
 * no such omission, so returning the document itself would still serialize `userId`.
 */
const toExportPayment = (
    payment: Awaited<ReturnType<typeof findOwnPayments>>[number]
): ExportPayment => ({
    id: String(payment._id),
    orderId: String(payment.orderId),
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    provider: payment.provider,
    ...(payment.cardLast4 === undefined ? {} : { cardLast4: payment.cardLast4 }),
    ...(payment.createdAt ? { createdAt: payment.createdAt.toISOString() } : {}),
    ...(payment.updatedAt ? { updatedAt: payment.updatedAt.toISOString() } : {})
});

/** This module's manifest entry: routes, the cancel-refund subscription, and locales. */
export default {
    name: 'payments',
    basePath: '/payments',
    /**
     * The permission keys this module introduces. Deleting the module deletes them:
     * `tests/cross-cutting/module-permissions.test.ts` refuses a key in the shared file
     * whose module is gone, and a module claiming one the file does not attribute to it.
     */
    permissions: [
        'payments.self.read',
        'payments.any.read',
        'payments.any.create',
        'payments.any.update'
    ],
    routes: router,
    /** The webhook and card-testing budgets — see `./rate-limits.ts`. */
    rateLimits: paymentsRateLimits,
    // The provider signs over the exact bytes it sent — relative to `basePath`, composed by the
    // app tier, so the mount point is stated once and the two cannot drift.
    rawBodyPaths: ['/webhook'],
    // `productionOnly`: `tests/support/setup.ts` supplies a dev value, and the `fake` provider
    // needs none locally — booting without it there is not the failure this guards against.
    requiredConfig: [
        {
            key: 'NODE_PAYMENT_WEBHOOK_SECRET',
            minLength: 16,
            placeholder: 'your-payment-webhook-secret-here',
            productionOnly: true
        }
    ],
    // Two checks `requiredConfig` cannot express: `NODE_BANK_TRANSFER_IBAN`/`_BIC` need
    // `ibantools` to validate, and `NODE_BANK_TRANSFER_IBAN` set with no `_BENEFICIARY` is a
    // cross-field rule. Plus `NODE_PAYMENT_PROVIDER` itself — `resolvePaymentProvider` already
    // throws a good message on an unknown name; this is what makes that throw happen at boot
    // instead of on the first payment.
    customCheck: () => [
        ...validateBankTransferConfig(),
        ...checkSelector('NODE_PAYMENT_PROVIDER', resolvePaymentProvider)
    ],
    personalData: [
        {
            section: 'payments',
            collect: (subject) =>
                findOwnPayments(subject.userId).then((payments) =>
                    payments.map((payment) => toExportPayment(payment))
                )
        }
    ],
    subscribe: () => {
        onDomainEvent(ORDER_CANCELLED, ({ orderId, refund }) =>
            refund ? refundForOrder(orderId) : undefined
        );
        // Detach, never delete: the payment survives the account.
        onDomainEvent(USER_DELETED, ({ userId }) => detachUserId(userId));
    },
    locales: path.join(__dirname, 'locales'),
    /**
     * One refunded payment, reached the way a shop reaches one: an order paid by card, then
     * cancelled by an operator, with this module's own `ORDER_CANCELLED` listener returning the
     * money. Named so the admin's refunded-payment screen has a row to open.
     *
     * The id behind it is the ORDER's: `GET /payments/order/{orderId}` is the only read path a
     * payment has, so a payment id would name a row no caller could fetch.
     */
    scenario: { shop: ['payment.refunded'] }
} satisfies AppModule;
