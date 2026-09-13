/**
 * @module
 * The copy of every document this module produces, resolved into finished strings. Same rule as
 * `@modules/account/emails`: the language is an argument, the output is finished text, and
 * whatever renders it later resolves nothing — see that file for why. Both artefacts are
 * rendered from an EJS template that only interpolates (confirmation through the queue, invoice
 * through Puppeteer), so neither template resolves a key.
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';
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
}

/**
 * Order confirmation, sent to the customer. The bought lines are resolved here, one translated
 * string each, since per-line copy interpolates per-line values and can't be a single string
 * decided up front. The total is `orderTotal`'s arithmetic, not a fresh sum — the email quotes
 * what the order stands for, shipping included.
 */
export const orderConfirmEmail = (
    locale: string,
    name: string,
    order: OrderLines
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
            total: t('orders.email-confirm.total', { total: orderTotal(order) }),
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
    payBy: Date
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
            total: t('orders.email-confirm.total', { total: orderTotal(order) }),
            footer: t('email.footer')
        }
    };
};

/**
 * The sweep cancelling a `bank_transfer` order whose deadline passed with no money — the
 * customer's answer to "what happened to my order". Never sent for a `card` order timing out:
 * that hold is thirty minutes and nobody has read a confirmation email by then.
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
            total: t('orders.email-confirm.total', { total: orderTotal(order) }),
            footer: t('email.footer')
        }
    };
};

/**
 * What the invoice needs beyond the lines: the order's id, for the document title.
 *
 * `id`, not `_id`. The order arrives from `orderRepository.findByIdScoped`, whose shape depends
 * on the caller's scope — an admin gets a hydrated document, an owner gets a transformed plain
 * object with `_id` already deleted. `id` is the half that resolves on both.
 */
export interface InvoiceOrder extends OrderLines {
    id?: unknown;
}

/**
 * Render context for the invoice PDF.
 *
 * Not an `EmailContent`: there is no envelope and no subject, just the document's own copy. The
 * per-line strings are built here, in a loop, because `orders.invoice.line` interpolates values
 * from each item — the one piece of copy that cannot be a single string decided up front.
 */
export const invoiceDocument = (locale: string, order: InvoiceOrder): Record<string, unknown> => {
    const t = translator(locale);
    return {
        locale,
        pageMetaTitle: t('orders.invoice.meta-title', { order: String(order.id) }),
        pageMetaLinks: [],
        title: t('orders.invoice.title'),
        lines: order.items.map((item) =>
            t('orders.invoice.line', {
                title: item.product.title,
                quantity: item.quantity,
                price: item.product.price
            })
        )
    };
};
