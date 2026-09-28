/**
 * @module
 * The copy of every mail this module sends, resolved into finished strings — the language is an
 * argument, the output is finished text, and the template queued behind it only interpolates.
 * Same rule as `@modules/account/emails`; see that file for why. The invoice document's own copy
 * lives in `@modules/invoicing`'s own `emails.ts`, not here — see `docs/modules/invoicing.md`.
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';
import { orderFrontendLink, orderCurrency } from './config';
import { orderTotal } from './domain';
import type { OrderTransferInstructions } from '@types';

/**
 * The minimum either document needs from an order: a title and a price per line.
 *
 * Structural rather than `OrderDocument`: what the documents print is the lines, and asking for
 * less than the whole document keeps both builders callable from a test with a two-line fixture.
 *
 * `product.title` arrives already resolved into the order's own frozen locale — see
 * `OrderDocumentItem.locale` and `resolveSnapshotProducts` — never the recipient's or the
 * request's. Neither builder below re-resolves it; they only interpolate.
 */
export interface OrderLines {
    items: { quantity: number; product: { title: string; price: number } }[];
    /** The shipping frozen at checkout. Absent on an order that chose no delivery method. */
    shippingCost?: number;
    /** The order's own frozen currency; `orderCurrency`'s fallback covers an order that predates it. */
    currency?: string;
}

/**
 * What every builder below actually quotes — `orderTotal`, resolved against `order`'s own
 * currency. Explicit fields, not `{ ...order, currency }`: `order` is often a hydrated Mongoose
 * document (`notify.ts`, `cancel.ts`), whose schema paths are prototype getters a spread copies
 * nothing from.
 */
const totalOf = (order: OrderLines): number =>
    orderTotal({
        items: order.items,
        shippingCost: order.shippingCost,
        currency: orderCurrency(order)
    });

/**
 * The placed-order email, sent to the customer — "order received, awaiting payment", never
 * "confirmed": every order this builds for is still `pending` at send time (a `bank_transfer`
 * order gets {@link bankTransferInstructionsEmail} instead, the only other placed-order mail).
 * The bought lines are resolved here, one translated string each, since per-line copy interpolates
 * per-line values and can't be a single string decided up front. The total is `orderTotal`'s
 * arithmetic, not a fresh sum — the email quotes what the order stands for, shipping included.
 *
 * Sent immediately at order creation, never held for anything the receipt needs: it renders on
 * demand, the moment someone actually asks for it. `linkUrl` points at the order's page, where
 * the download button is always live.
 */
export const orderConfirmEmail = (
    locale: string,
    name: string,
    order: OrderLines,
    orderId: string
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'orders.order-confirm',
        subject: t('orders.email-confirm.subject'),
        data: {
            locale,
            pageMetaTitle: t('orders.email-confirm.meta-title'),
            pageMetaLinks: [],
            greeting: t('orders.email-confirm.greeting', { name }),
            body: t('orders.email-confirm.body'),
            lines: order.items.map((item) =>
                t('orders.email-confirm.line', {
                    title: item.product.title,
                    quantity: item.quantity,
                    price: item.product.price
                })
            ),
            total: t('orders.email-confirm.total', { total: totalOf(order) }),
            linkLabel: t('orders.email-confirm.link-label'),
            linkUrl: orderFrontendLink({ locale, id: orderId }),
            footer: t('email.footer')
        }
    };
};

/**
 * Payment received, sent once `payments`' settlement actually commits the stock —
 * `services/settlement.ts`'s `settlePayment` is the one caller. The customer's answer to "did my
 * card go through": {@link orderConfirmEmail} only ever said the order was received, never that
 * it was paid.
 */
export const paymentSucceededEmail = (
    locale: string,
    name: string,
    order: OrderLines,
    orderId: string
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'orders.order-paid',
        subject: t('orders.email-paid.subject'),
        data: {
            locale,
            pageMetaTitle: t('orders.email-paid.meta-title'),
            pageMetaLinks: [],
            greeting: t('orders.email-paid.greeting', { name }),
            body: t('orders.email-paid.body'),
            lines: order.items.map((item) =>
                t('orders.email-paid.line', {
                    title: item.product.title,
                    quantity: item.quantity,
                    price: item.product.price
                })
            ),
            total: t('orders.email-paid.total', { total: totalOf(order) }),
            linkLabel: t('orders.email-paid.link-label'),
            linkUrl: orderFrontendLink({ locale, id: orderId }),
            footer: t('email.footer')
        }
    };
};

/**
 * The instructions and deadline for a `bank_transfer` checkout, sent instead of
 * {@link orderConfirmEmail} — there is nothing to confirm yet, only what the customer still has
 * to do. `payBy` is formatted with `Intl.DateTimeFormat` in the recipient's own language rather
 * than a hand-rolled date string, the same `node:` standard-library-first rule that keeps this
 * repo away from a date-formatting dependency.
 */
export const bankTransferInstructionsEmail = (
    locale: string,
    name: string,
    order: OrderLines,
    instructions: OrderTransferInstructions,
    payBy: Date,
    orderId: string
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'orders.order-transfer-instructions',
        subject: t('orders.email-transfer.subject'),
        data: {
            locale,
            pageMetaTitle: t('orders.email-transfer.meta-title'),
            pageMetaLinks: [],
            greeting: t('orders.email-transfer.greeting', { name }),
            body: t('orders.email-transfer.body'),
            beneficiary: instructions.beneficiary,
            iban: instructions.iban,
            // Not a conditional spread: `undefined` here still reads as "unset" to the
            // template's `typeof bic !== "undefined"` guard, and a bare key keeps this object a
            // plain literal `tests/cross-cutting/mail-copy.test.ts` can read statically.
            bic: instructions.bic,
            reference: instructions.reference,
            deadline: t('orders.email-transfer.deadline', {
                payBy: new Intl.DateTimeFormat(locale, {
                    dateStyle: 'long',
                    timeStyle: 'short'
                }).format(payBy)
            }),
            total: t('orders.email-confirm.total', { total: totalOf(order) }),
            // Order-number allocation doesn't wait on payment (see `order-numbering.ts`), so the
            // same link, rendering the same receipt on demand, applies here as on the paid path.
            linkLabel: t('orders.email-transfer.link-label'),
            linkUrl: orderFrontendLink({ locale, id: orderId }),
            footer: t('email.footer')
        }
    };
};

/**
 * The sweep cancelling a `bank_transfer` order whose deadline passed with no money — the
 * customer's answer to "what happened to my order".
 */
export const bankTransferExpiredEmail = (locale: string, order: OrderLines): EmailContent => {
    const t = translator(locale);
    return {
        template: 'orders.order-transfer-expired',
        subject: t('orders.email-transfer-expired.subject'),
        data: {
            locale,
            pageMetaTitle: t('orders.email-transfer-expired.meta-title'),
            pageMetaLinks: [],
            greeting: t('orders.email-transfer-expired.greeting'),
            body: t('orders.email-transfer-expired.body'),
            total: t('orders.email-confirm.total', { total: totalOf(order) }),
            footer: t('email.footer')
        }
    };
};

/**
 * {@link bankTransferExpiredEmail}'s twin for a `card` hold — a customer who never finished
 * checkout gets the same explanation once the thirty-minute reservation lapses, its own template
 * since the wording differs (a hold, not a deadline sent up front).
 */
export const cardHoldExpiredEmail = (locale: string, order: OrderLines): EmailContent => {
    const t = translator(locale);
    return {
        template: 'orders.order-card-expired',
        subject: t('orders.email-card-expired.subject'),
        data: {
            locale,
            pageMetaTitle: t('orders.email-card-expired.meta-title'),
            pageMetaLinks: [],
            greeting: t('orders.email-card-expired.greeting'),
            body: t('orders.email-card-expired.body'),
            total: t('orders.email-confirm.total', { total: totalOf(order) }),
            footer: t('email.footer')
        }
    };
};

/**
 * The customer's answer to "what happened to my order" when it was cancelled because a product
 * on it stopped being sellable — a hard delete, or a deactivation. Sent for every such
 * cancellation, `bank_transfer` or `card` alike: unlike a payment-hold timeout, this happens with
 * no warning the buyer could have expected, so it always deserves an explanation.
 *
 * @param unavailable - the lines that caused the cancellation, from `unavailableLines`
 */
export const productUnavailableCancelledEmail = (
    locale: string,
    unavailable: readonly { title: string }[]
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'orders.order-product-unavailable',
        subject: t('orders.email-product-unavailable.subject'),
        data: {
            locale,
            pageMetaTitle: t('orders.email-product-unavailable.meta-title'),
            pageMetaLinks: [],
            greeting: t('orders.email-product-unavailable.greeting'),
            body: t('orders.email-product-unavailable.body'),
            lines: unavailable.map((line) =>
                t('orders.email-product-unavailable.line', { title: line.title })
            ),
            footer: t('email.footer')
        }
    };
};
