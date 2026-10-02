/**
 * @module
 * Payments: an order's money, behind a provider port (`./providers`), so the generic part of
 * taking money can be bought rather than built. Depends on orders (a payment freezes an order's
 * total, refunds answer `ORDER_REFUND_OWED` rather than the customer-facing `ORDER_CANCELLED` —
 * see `docs/modules/payments.md` — and `ORDER_CANCELLED` itself is only a best-effort trigger to
 * close a still-open intent at the provider, never a refund) and on inventory (the confirm commits
 * an order's held stock into a sale). Depends on users to resolve the payer, and to detach one
 * through its own `personalData.erase` hook — the payment survives account erasure, same as the
 * order it paid for.
 *
 * See: docs/modules/payments.md
 */

import path from 'node:path';
import type { AppModule, PublicEventTarget } from '@kernel/registry';
import { onDomainEvent, type DomainEventMap } from '@kernel/events';
import { ORDER_REFUND_OWED, ORDER_CANCELLED } from '@modules/orders';
import { router } from './routes';
import {
    refundForOrder,
    cancelOpenIntentForOrder,
    detachUserId,
    findOwnPaymentsForExport
} from './services';
import { paymentsRateLimits } from './rate-limits';
// Also installs this module's event declarations (PAYMENT_SUCCEEDED, PAYMENT_FAILED,
// PAYMENT_REFUNDED). Reached directly, never through this module's own barrel — see CLAUDE.md's
// module-barrel rule.
import { PAYMENT_SUCCEEDED, PAYMENT_FAILED, PAYMENT_REFUNDED } from './events';
import { paymentsConfig } from './config';
import { paymentProviderProbe } from './providers';

/**
 * DDD-D4: this module's public (webhook-visible) events — `webhooks/services/publish.ts`
 * subscribes to these generically, through `kernel/registry.ts`'s `resolvePublicEvents`, instead
 * of importing `PAYMENT_SUCCEEDED`/`PAYMENT_FAILED`/`PAYMENT_REFUNDED` by name.
 * `payment.succeeded`/`payment.failed` are a straight rename: the public payload is exactly the
 * domain one. `payment.refunded` additionally carries `amount`/`currency` — already on the domain
 * event, and worth a subscriber not having to look the payment back up for.
 */
const publicEvents: Readonly<Record<string, PublicEventTarget>> = {
    [PAYMENT_SUCCEEDED]: {
        toPublicEvent: (payload: DomainEventMap[typeof PAYMENT_SUCCEEDED]) => ({
            eventType: 'payment.succeeded',
            data: { paymentId: payload.paymentId, orderId: payload.orderId }
        })
    },
    [PAYMENT_FAILED]: {
        toPublicEvent: (payload: DomainEventMap[typeof PAYMENT_FAILED]) => ({
            eventType: 'payment.failed',
            data: { paymentId: payload.paymentId, orderId: payload.orderId }
        })
    },
    [PAYMENT_REFUNDED]: {
        toPublicEvent: (payload: DomainEventMap[typeof PAYMENT_REFUNDED]) => ({
            eventType: 'payment.refunded',
            data: {
                paymentId: payload.paymentId,
                orderId: payload.orderId,
                refundId: payload.refundId,
                amount: payload.amount,
                currency: payload.currency
            }
        })
    }
};

/** This module's manifest entry: routes, the cancel-refund subscription, and locales. */
export default {
    name: 'payments',
    basePath: '/payments',
    routes: router,
    publicEvents,
    /** The webhook and card-testing budgets — see `./rate-limits.ts`. */
    rateLimits: paymentsRateLimits,
    // The provider signs over the exact bytes it sent — relative to `basePath`, composed by the
    // app tier, so the mount point is stated once and the two cannot drift.
    rawBodyPaths: ['/webhook'],
    // The webhook secret, the Stripe key gate and the bank-transfer values: see `./config`. The
    // provider selector is probed beside its registry, since the resolver imports the config.
    config: [paymentsConfig.slice, paymentProviderProbe.slice],
    personalData: [
        {
            section: 'payments',
            collect: (subject) => findOwnPaymentsForExport(subject.userId),
            // DDD-D6: detach, never delete — the payment survives the account, inside the same
            // hard-delete transaction. See `detachUserId`.
            erase: detachUserId
        }
    ],
    subscribe: () => {
        // `ORDER_REFUND_OWED`, not `ORDER_CANCELLED` — the event exists only when a refund is
        // owed, so there is no boolean left to branch on.
        onDomainEvent(ORDER_REFUND_OWED, ({ orderId }) => refundForOrder(orderId));
        // `ORDER_CANCELLED` itself, for the OTHER thing a cancel can leave behind: a card intent
        // nobody ever finished, still open at the provider (E17). Best-effort — the cancel already
        // happened by the time this runs, so a provider failure here is logged, never rethrown.
        onDomainEvent(ORDER_CANCELLED, ({ orderId }) => cancelOpenIntentForOrder(orderId));
    },
    locales: path.join(__dirname, 'locales'),
    /**
     * One refunded payment, reached the way a shop reaches one: an order paid by card, then
     * cancelled by an operator, with this module's own `ORDER_REFUND_OWED` listener returning the
     * money. Named so the admin's refunded-payment screen has a row to open.
     *
     * The id behind it is the ORDER's: `GET /payments/order/{orderId}` is the only read path a
     * payment has, so a payment id would name a row no caller could fetch.
     */
    scenario: { shop: ['payment.refunded'] }
} satisfies AppModule;
