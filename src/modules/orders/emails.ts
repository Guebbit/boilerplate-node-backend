/**
 * The copy of every document this module produces, resolved into finished strings.
 *
 * Same rule as `@modules/account/emails`: the language is an argument, the output is finished
 * text, and whatever renders it later resolves nothing. See that file for why.
 *
 * Both artefacts here are rendered from an EJS template that only interpolates — the confirmation
 * email through the queue, the invoice through Puppeteer — so neither template resolves a key.
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';
import { sumLineItems } from './domain';

/**
 * The minimum either document needs from an order: a title and a price per line.
 *
 * Structural rather than `OrderDocument`: what the documents print is the lines, and asking for
 * less than the whole document keeps both builders callable from a test with a two-line fixture.
 */
export interface OrderLines {
    items: { quantity: number; product: { title: string; price: number } }[];
}

/**
 * Order confirmation, sent to the customer.
 *
 * The bought lines are resolved here, one translated string each, for the same reason the invoice
 * does it — per-line copy interpolates per-line values, so it cannot be a single string decided up
 * front. The total is `sumLineItems`' arithmetic, not a fresh sum: the email quotes the number the
 * order stands for.
 */
export const orderConfirmEmail = (
    locale: string,
    name: string,
    order: OrderLines
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'orders.order-confirm.ejs',
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
            total: t('orders.email-confirm.total', { total: sumLineItems(order.items).price }),
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
