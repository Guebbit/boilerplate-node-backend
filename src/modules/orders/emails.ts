/**
 * The copy of every document this module produces, resolved into finished strings.
 *
 * Same rule as `@modules/account/emails`: the language is an argument, the output is finished
 * text, and whatever renders it later resolves nothing. See that file for why.
 *
 * Both artefacts here are rendered from an EJS template that only interpolates — the confirmation
 * email through the queue, the invoice through Puppeteer — so neither template resolves a key.
 */

import type { IEmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';

/** Order confirmation, sent to the customer. */
export const orderConfirmEmail = (locale: string, name: string): IEmailContent => {
    const t = translator(locale);
    return {
        template: 'email-order-confirm.ejs',
        subject: t('orders.email-confirm.subject'),
        data: {
            locale,
            pageMetaTitle: t('orders.email-confirm.meta-title'),
            pageMetaLinks: [],
            greeting: t('orders.email-confirm.greeting', { name }),
            body: t('orders.email-confirm.body'),
            footer: t('email.footer')
        }
    };
};

/**
 * The minimum an invoice needs from an order.
 *
 * Structural rather than `IOrderDocument`: what the document prints is a title and a price per
 * line, and asking for less than the whole document keeps this callable from a test with a
 * two-line fixture.
 */
export interface IInvoiceOrder {
    _id?: unknown;
    items: { quantity: number; product: { title: string; price: number } }[];
}

/**
 * Render context for the invoice PDF.
 *
 * Not an `IEmailContent`: there is no envelope and no subject, just the document's own copy. The
 * per-line strings are built here, in a loop, because `orders.invoice.line` interpolates values
 * from each item — the one piece of copy that cannot be a single string decided up front.
 */
export const invoiceDocument = (locale: string, order: IInvoiceOrder): Record<string, unknown> => {
    const t = translator(locale);
    return {
        locale,
        pageMetaTitle: t('orders.invoice.meta-title', { order: String(order._id) }),
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
