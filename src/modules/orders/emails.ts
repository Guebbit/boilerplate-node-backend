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
import { invoiceCurrency, shopCountry, shopLegalName, shopVatNumber } from './config';
import { orderTotal, orderTaxBreakdown, type TaxRateSummary } from './domain';
import type { OrderTransferInstructions } from '@types';

/**
 * Absolute URL for this order's page on the paired frontend — where the customer signs in and
 * downloads the invoice once it's ready, `GET /orders/{id}/invoice` being an authenticated API
 * route rather than something an email client can fetch directly.
 *
 * Same construction as `account/emails.ts`'s `accountLink`: joined through `URL` when `NODE_URL`
 * is set (a trailing-slash-dependent concatenation would otherwise produce
 * `https://api.example.comorders/…`), no fallback host when it isn't — a relative link in a mail
 * body is merely useless without `NODE_URL`, not a wrong destination.
 */
const orderLink = (orderId: string): string => {
    const path = `orders/${orderId}`;
    return process.env.NODE_URL ? new URL(path, process.env.NODE_URL).href : path;
};

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
 *
 * Sent immediately at order creation, same as always — never held for the invoice PDF to finish
 * generating. `linkUrl` points at the order's page regardless of whether the invoice is ready yet:
 * the download button there greys out on its own until `invoicePdfStatus` reads `ready`.
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
            total: t('orders.email-confirm.total', { total: orderTotal(order) }),
            linkLabel: t('orders.email-confirm.link-label'),
            linkUrl: orderLink(orderId),
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
            total: t('orders.email-confirm.total', { total: orderTotal(order) }),
            // Invoice number allocation doesn't wait on payment (see `invoice-numbering.ts`), so
            // the same link and the same eventually-ready PDF apply here as on the paid path.
            linkLabel: t('orders.email-transfer.link-label'),
            linkUrl: orderLink(orderId),
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
    unitPrice: string;
    netAmount: string;
    /** Formatted here, not in the template — `0.22` becomes `"22%"` once, not on every render. */
    taxRateLabel: string;
    taxAmount: string;
    /**
     * `netAmount + taxAmount`, never re-derived from `unitPrice × quantity` — that multiply is a
     * float operation the way JavaScript does it (`19.99 × 5` is `99.94999999999999`, not
     * `99.95`), so it drifted from the two columns beside it. This is the invoice's own promise:
     * the columns must add back up to what was charged, to the cent.
     */
    grossAmount: string;
}

/**
 * One row of a rate-grouped table — the shipping-by-rate breakdown or the per-rate summary, both
 * the same shape. `description` carries what differs between a per-line row and one of these:
 * "which rate", not "which product".
 */
export interface InvoiceTaxSummaryRow {
    description: string;
    netAmount: string;
    taxRateLabel: string;
    taxAmount: string;
    grossAmount: string;
}

/**
 * The invoice's VAT table and the shop's own legal identity — present only on an order that
 * actually carries VAT figures. `undefined` renders no block at all, rather than one implying a
 * rate that was never charged. Every amount is ALREADY formatted for `locale` — the template only
 * interpolates, same rule as `taxRateLabel`'s own comment always held for the rate column alone.
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
    /** Absent (never an empty-titled table) on an order with no delivery method or free shipping. */
    shipping?: {
        title: string;
        /** One row per rate shipping was actually apportioned to and taxed at. */
        rows: InvoiceTaxSummaryRow[];
    };
    summaryTitle: string;
    /** One row per distinct rate charged on the order, goods and shipping combined. */
    summaryRows: InvoiceTaxSummaryRow[];
    netTotalLabel: string;
    netTotal: string;
    taxTotalLabel: string;
    taxTotal: string;
    grandTotalLabel: string;
    /** `orderTotal(order)` — every line's gross plus shipping, the amount actually paid. */
    grandTotal: string;
    supplier: {
        /** Absent when `NODE_SHOP_LEGAL_NAME` is unset — the template omits the row entirely. */
        legalName?: string;
        /** Pre-composed: names the VAT number, or says plainly that none is configured. */
        vatNumberLine: string;
        /** Absent when `NODE_SHOP_COUNTRY` is unset — should not happen once boot has passed. */
        country?: string;
    };
}

/** A decimal rate (`0.22`) as the invoice prints it (`"22%"`) — formatted once, not per cell. */
const percent = (rate: number): string => `${Math.round(rate * 100)}%`;

/**
 * Builds the invoice's VAT table, recomputing the breakdown fresh from the order's frozen lines —
 * same reasoning `orderTotal` already applies to the grand total in this file: the controller may
 * hand this an untransformed document, so nothing here may assume a derived field was already
 * computed. `undefined` on a pre-VAT order, which is the caller's signal to render no VAT block.
 * @param locale - the document's language, for `Intl.NumberFormat` — every amount below goes
 *   through it, in `invoiceCurrency()`'s configured currency
 * @param t - this document's translator, already fixed to `locale`
 * @param order - the order the invoice is for
 * @returns the VAT block, or `undefined` when the order carries no VAT figures
 */
const buildVatBlock = (
    locale: string,
    t: TFunction,
    order: InvoiceOrder
): InvoiceVatBlock | undefined => {
    const breakdown = orderTaxBreakdown(order);
    if (!breakdown) return undefined;

    // One instance, reused for every amount on the invoice — this is a real allocation
    // (constructing a Collator/PluralRules under the hood), not worth paying once per cell.
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat
    const money = new Intl.NumberFormat(locale, { style: 'currency', currency: invoiceCurrency() });

    const summaryRowOf = (row: TaxRateSummary, description: string): InvoiceTaxSummaryRow => ({
        description,
        netAmount: money.format(row.netAmount),
        taxRateLabel: percent(row.rate),
        taxAmount: money.format(row.taxAmount),
        grossAmount: money.format(row.grossAmount)
    });

    const rows = order.items.map((item, index) => ({
        description: item.product.title,
        quantity: item.quantity,
        unitPrice: money.format(item.product.price),
        netAmount: money.format(breakdown.lines[index].netAmount),
        taxRateLabel: percent(item.product.taxRate ?? 0),
        taxAmount: money.format(breakdown.lines[index].taxAmount),
        grossAmount: money.format(
            breakdown.lines[index].netAmount + breakdown.lines[index].taxAmount
        )
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
        shipping:
            breakdown.shippingByRate.length === 0
                ? undefined
                : {
                      title: t('orders.invoice.vat.shipping-title'),
                      rows: breakdown.shippingByRate.map((row) =>
                          summaryRowOf(
                              row,
                              t('orders.invoice.vat.shipping-row', { rate: percent(row.rate) })
                          )
                      )
                  },
        summaryTitle: t('orders.invoice.vat.summary-title'),
        summaryRows: breakdown.taxSummary.map((row) =>
            summaryRowOf(row, t('orders.invoice.vat.summary-row', { rate: percent(row.rate) }))
        ),
        netTotalLabel: t('orders.invoice.vat.net-total'),
        netTotal: money.format(breakdown.netTotal),
        taxTotalLabel: t('orders.invoice.vat.tax-total'),
        taxTotal: money.format(breakdown.taxTotal),
        grandTotalLabel: t('orders.invoice.vat.grand-total'),
        grandTotal: money.format(orderTotal(order)),
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
        vat: buildVatBlock(locale, t, order),
        meta: buildInvoiceMeta(locale, t, order)
    };
};
