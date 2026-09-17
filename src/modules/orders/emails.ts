/**
 * @module
 * The copy of every document this module produces, resolved into finished strings. Same rule as
 * `@modules/account/emails`: the language is an argument, the output is finished text, and
 * whatever renders it later resolves nothing — see that file for why. Both artefacts are
 * rendered from an EJS template that only interpolates (confirmation through the queue, invoice
 * through Puppeteer), so neither template resolves a key.
 */

import type { TFunction } from 'i18next';
import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';
import { shopCountry, shopLegalName, shopVatNumber } from './config';
import { orderTotal, orderTaxBreakdown } from './domain';
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
 * What the invoice needs beyond the lines: the order's id, for the document title, each line's
 * frozen `taxRate` — the VAT figures themselves are recomputed fresh by {@link buildVatBlock},
 * same reasoning as `orderTotal` below — and the two fields Art. 226 requires, `invoiceNumber`
 * and `createdAt`, printed together by {@link buildInvoiceMeta}.
 *
 * `id`, not `_id`. The order arrives from `orderRepository.findByIdScoped`, whose shape depends
 * on the caller's scope — an admin gets a hydrated document, an owner gets a transformed plain
 * object with `_id` already deleted. `id` is the half that resolves on both, and NEITHER has run
 * through `applyOrderTransform`'s derived fields: this controller renders the raw document
 * directly, without ever calling `.toJSON()` — which is also why `createdAt` below is a real
 * `Date`, not yet the ISO string an HTTP response would show.
 */
export interface InvoiceOrder extends OrderLines {
    id?: unknown;
    items: {
        quantity: number;
        product: { title: string; price: number; taxRate?: number };
    }[];
    /** Absent on an order that predates sequential invoice numbering. */
    invoiceNumber?: string;
    /** This invoice's date of supply — the moment `invoiceNumber` was assigned. */
    createdAt?: Date;
}

/** The invoice number and its date of supply, printed together or not at all. */
export interface InvoiceMeta {
    numberLabel: string;
    dateLabel: string;
}

/**
 * The invoice-number-and-date block EU VAT Directive 2006/112/EC Art. 226 requires — gated as one
 * unit on `invoiceNumber` being present, same as {@link buildVatBlock} gates its own block on a
 * frozen rate: a date with no number would misrepresent an order that predates full compliance
 * metadata as if it had one. `createdAt` IS the date of supply, since the number is assigned at
 * the same moment — see `OrderDocument.invoiceNumber`.
 * @param locale - the document's language, for formatting the date
 * @param t - this document's translator, already fixed to `locale`
 * @param order - the order the invoice is for
 * @returns the meta block, or `undefined` on an order with no invoice number
 */
const buildInvoiceMeta = (
    locale: string,
    t: TFunction,
    order: InvoiceOrder
): InvoiceMeta | undefined => {
    if (!order.invoiceNumber || !order.createdAt) return undefined;

    return {
        numberLabel: t('orders.invoice.number', { number: order.invoiceNumber }),
        // `Intl.DateTimeFormat`, not a hand-rolled date string — same standard-library-first rule
        // `bankTransferInstructionsEmail`'s `deadline` above already follows.
        dateLabel: t('orders.invoice.date', {
            date: new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(order.createdAt)
        })
    };
};

/** One row of the invoice's VAT table — a line's own figures, ready to interpolate as-is. */
export interface InvoiceVatRow {
    description: string;
    quantity: number;
    unitPrice: number;
    netAmount: number;
    /** Formatted here, not in the template — `0.22` becomes `"22%"` once, not on every render. */
    taxRateLabel: string;
    taxAmount: number;
    grossAmount: number;
}

/**
 * The invoice's VAT table and the shop's own legal identity — present only on an order that
 * actually carries VAT figures. `undefined` renders no block at all, rather than one implying a
 * rate that was never charged.
 */
export interface InvoiceVatBlock {
    columns: {
        description: string;
        quantity: string;
        unitPrice: string;
        net: string;
        rate: string;
        tax: string;
        gross: string;
    };
    rows: InvoiceVatRow[];
    netTotalLabel: string;
    netTotal: number;
    taxTotalLabel: string;
    taxTotal: number;
    supplier: {
        /** Absent when `NODE_SHOP_LEGAL_NAME` is unset — the template omits the row entirely. */
        legalName?: string;
        /** Pre-composed: names the VAT number, or says plainly that none is configured. */
        vatNumberLine: string;
        /** Absent when `NODE_SHOP_COUNTRY` is unset — should not happen once boot has passed. */
        country?: string;
    };
}

/**
 * Builds the invoice's VAT table, recomputing the breakdown fresh from the order's frozen lines —
 * same reasoning `orderTotal` already applies to the grand total in this file: the controller may
 * hand this an untransformed document, so nothing here may assume a derived field was already
 * computed. `undefined` on a pre-VAT order, which is the caller's signal to render no VAT block.
 * @param t - this document's translator, already fixed to its locale
 * @param order - the order the invoice is for
 * @returns the VAT block, or `undefined` when the order carries no VAT figures
 */
const buildVatBlock = (t: TFunction, order: InvoiceOrder): InvoiceVatBlock | undefined => {
    const breakdown = orderTaxBreakdown(order);
    if (!breakdown) return undefined;

    const rows = order.items.map((item, index) => ({
        description: item.product.title,
        quantity: item.quantity,
        unitPrice: item.product.price,
        netAmount: breakdown.lines[index].netAmount,
        // A rate is a fraction (0.22); the invoice prints the percentage a customer expects.
        taxRateLabel: `${Math.round((item.product.taxRate ?? 0) * 100)}%`,
        taxAmount: breakdown.lines[index].taxAmount,
        grossAmount: item.product.price * item.quantity
    }));

    return {
        columns: {
            description: t('orders.invoice.vat.column-description'),
            quantity: t('orders.invoice.vat.column-quantity'),
            unitPrice: t('orders.invoice.vat.column-unit-price'),
            net: t('orders.invoice.vat.column-net'),
            rate: t('orders.invoice.vat.column-rate'),
            tax: t('orders.invoice.vat.column-tax'),
            gross: t('orders.invoice.vat.column-gross')
        },
        rows,
        netTotalLabel: t('orders.invoice.vat.net-total'),
        netTotal: breakdown.netTotal,
        taxTotalLabel: t('orders.invoice.vat.tax-total'),
        taxTotal: breakdown.taxTotal,
        supplier: {
            legalName: shopLegalName(),
            vatNumberLine: shopVatNumber()
                ? t('orders.invoice.vat.vat-number', { number: shopVatNumber() })
                : t('orders.invoice.vat.vat-number-missing'),
            country: shopCountry()
        }
    };
};

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
        ),
        vat: buildVatBlock(t, order),
        meta: buildInvoiceMeta(locale, t, order)
    };
};
