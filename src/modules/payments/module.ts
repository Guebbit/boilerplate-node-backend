/**
 * @module
 * Payments: an order's money, behind a provider port (`./providers`), so the generic part of
 * taking money can be bought rather than built. Depends on orders (a payment freezes an order's
 * total, and a refunding `ORDER_CANCELLED` opens the refund — see `docs/modules/payments.md`)
 * Detaches an erased account through its own `personalData.erase` hook — the payment survives account erasure, same as the order it paid for.
 *
 * See: docs/modules/payments.md
 */

import path from 'node:path';
import type { AppModule, PublicEventTarget } from '@kernel/registry';
import { onDomainEvent, type DomainEventMap } from '@kernel/events';
import { ORDER_CANCELLED, ORDER_CREATED } from '@modules/orders';
import { router } from './routes';
import { orderRouter } from './order-routes';
import { paymentService } from './services';
import { cancelOpenIntentForOrder } from './services/intent';
import { refundForOrder } from './services/refunds';
import { paymentsRateLimits } from './rate-limits';
// Also installs this module's event declarations (PAYMENT_SUCCEEDED, PAYMENT_FAILED,
// PAYMENT_REFUNDED). Reached directly, never through this module's own barrel — see CLAUDE.md's
// module-barrel rule.
import {
    PAYMENT_SUCCEEDED,
    PAYMENT_FAILED,
    PAYMENT_REFUNDED,
    PAYMENT_REFUND_FAILED,
    PAYMENT_REFUND_REVERSED,
    PAYMENT_DISPUTE_OPENED,
    PAYMENT_DISPUTE_UPDATED
} from './events';
import { paymentsConfig } from './config';
import { paymentProviderProbe } from './providers';
import { paymentsJobs } from './jobs';

/**
 * This module's public (webhook-visible) events — `webhooks/services/publish.ts`
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
    },
    [PAYMENT_REFUND_FAILED]: {
        toPublicEvent: (payload: DomainEventMap[typeof PAYMENT_REFUND_FAILED]) => ({
            eventType: 'payment.refund_failed',
            data: {
                paymentId: payload.paymentId,
                orderId: payload.orderId,
                refundId: payload.refundId,
                amount: payload.amount,
                currency: payload.currency,
                failureReason: payload.failureReason,
                final: payload.final
            }
        })
    },
    [PAYMENT_DISPUTE_OPENED]: {
        toPublicEvent: (payload: DomainEventMap[typeof PAYMENT_DISPUTE_OPENED]) => ({
            eventType: 'payment.dispute_opened',
            // The domain payload is already the public one: ids, closed codes and money, no free text.
            data: { ...payload }
        })
    },
    [PAYMENT_DISPUTE_UPDATED]: {
        toPublicEvent: (payload: DomainEventMap[typeof PAYMENT_DISPUTE_UPDATED]) => ({
            eventType: 'payment.dispute_updated',
            // The domain payload is already the public one: ids, closed codes and money, no free text.
            data: { ...payload }
        })
    },
    [PAYMENT_REFUND_REVERSED]: {
        toPublicEvent: (payload: DomainEventMap[typeof PAYMENT_REFUND_REVERSED]) => ({
            eventType: 'payment.refund_reversed',
            data: {
                paymentId: payload.paymentId,
                orderId: payload.orderId,
                refundId: payload.refundId,
                amount: payload.amount,
                currency: payload.currency,
                failureReason: payload.failureReason
            }
        })
    }
};

/** This module's manifest entry: routes, the cancel-refund subscription, and locales. */
export default {
    name: 'payments',
    mounts: [
        { basePath: '/payments', routes: router },
        // `POST /orders/{id}/payments`: the order's URL, payments' own key.
        { basePath: '/orders', routes: orderRouter }
    ],
    jobs: paymentsJobs,
    publicEvents,
    /** The webhook and card-testing budgets — see `./rate-limits.ts`. */
    rateLimits: paymentsRateLimits,
    // The provider signs over the exact bytes it sent — relative to the first mount's `basePath`, composed by the
    // app tier, so the mount point is stated once and the two cannot drift.
    rawBodyPaths: ['/webhook'],
    // The webhook secret and the bank-transfer values: see `./config`. The
    // provider selector is probed beside its registry, since the resolver imports the config.
    config: [paymentsConfig.slice, paymentProviderProbe.slice],
    personalData: [
        {
            section: 'payments',
            collect: (subject) => paymentService.findOwnPaymentsForExport(subject.userId),
            // Detach, never delete — the payment survives the account, inside the same
            // hard-delete transaction. See `detachUserId`.
            erase: ({ userId }, session) => paymentService.detachUserId(userId, session)
        }
    ],
    subscribe: () => {
        // `ORDER_CANCELLED` is both halves of what a cancel leaves with `payments`: a card intent
        // nobody finished, still open at the provider (closed best-effort, never rethrown), and —
        // when `refund` says so — the money already taken. The refund is the durable half: its
        // event is an outbox row, and a rejection here makes the relay deliver it again.
        onDomainEvent(ORDER_CANCELLED, ({ orderId, refund, cause }) =>
            cancelOpenIntentForOrder(orderId, cause === 'reservation_expired').then(() =>
                refund ? refundForOrder(orderId) : undefined
            )
        );
        // A bank-transfer order is owed money from the moment it is placed: its payment, with the
        // reference and the instructions, opens with it.
        onDomainEvent(ORDER_CREATED, ({ orderId }) => paymentService.openTransferPayment(orderId));
        // This module's own two mails, from its own facts — see `./services/notify.ts`.
        onDomainEvent(PAYMENT_SUCCEEDED, paymentService.mailPaymentReceived);
        onDomainEvent(PAYMENT_REFUNDED, paymentService.mailRefundIssued);
        // One mail, two triggers: a refusal that ended the retrying, and a settled refund the bank
        // sent back. The listener reads the record, so a refusal that is not the card's mails nobody.
        onDomainEvent(PAYMENT_REFUND_FAILED, paymentService.mailRefundUndeliverable);
        onDomainEvent(PAYMENT_REFUND_REVERSED, paymentService.mailRefundUndeliverable);
    },
    locales: path.join(__dirname, 'locales'),
    templates: path.join(__dirname, 'templates'),
    /**
     * One refunded payment, reached the way a shop reaches one: an order paid by card, then
     * cancelled by an operator, with this module's own `order.cancelled` listener returning the
     * money. Named so the admin's refunded-payment screen has a row to open.
     *
     * The id behind it is the ORDER's: `GET /orders/{id}/payments` reads a payment by its order, so the
     * subject is the order the row belongs to.
     */
    scenario: { shop: ['payment.refunded'] }
} satisfies AppModule;
