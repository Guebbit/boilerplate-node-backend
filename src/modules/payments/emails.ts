/**
 * @module
 * The copy of the two mails this module sends, resolved into finished strings — same rule as
 * `@modules/account/emails`: the language is an argument, the output is finished text, and the
 * template queued behind it only interpolates. See that file for why.
 *
 * Two mails: "payment received" when a payment settles, "refund issued" when a refund does.
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';
import { orderFrontendLink, orderTotal, type OrderLines } from '@modules/orders';

/**
 * An amount in a currency, spelled the way the recipient's locale writes money.
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat
 * @param locale - the recipient's language
 * @param amount - a decimal in `currency`
 * @param currency - an ISO-4217 code
 */
const money = (locale: string, amount: number, currency: string): string =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);

/**
 * Payment received, sent once `settlePayment` actually commits the stock. The customer's answer
 * to "did my card go through": the order-placed mail only ever said the order was received.
 * @param locale - the recipient's language
 * @param name - the greeting's name
 * @param order - the paid order's lines, shipping and currency
 * @param orderId - the order's id, for the link to its page
 */
export const paymentReceivedEmail = (
    locale: string,
    name: string,
    order: OrderLines,
    orderId: string
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'payments.payment-received',
        subject: t('payments.email-received.subject'),
        data: {
            locale,
            pageMetaTitle: t('payments.email-received.meta-title'),
            pageMetaLinks: [],
            greeting: t('payments.email-received.greeting', { name }),
            body: t('payments.email-received.body'),
            lines: order.items.map((item) =>
                t('payments.email-received.line', {
                    title: item.product.title,
                    quantity: item.quantity,
                    price: item.product.price
                })
            ),
            // Explicit fields, not a spread: `order` is often a hydrated Mongoose document, whose
            // schema paths are prototype getters a spread copies nothing from.
            total: t('payments.email-received.total', {
                total: orderTotal({
                    items: order.items,
                    shippingCost: order.shippingCost,
                    currency: order.currency
                })
            }),
            linkLabel: t('payments.email-received.link-label'),
            linkUrl: orderFrontendLink({ locale, id: orderId }),
            footer: t('email.footer')
        }
    };
};

/**
 * Money went back to the customer outside a return — a refund that followed a cancel, or an
 * operator's own goodwill refund. A return's refund is announced by `returns`' own closing
 * notice, so it never reaches this builder. Sent when the refund SETTLES, so it only ever says
 * what already happened.
 *
 * @param locale - the recipient's language
 * @param name - the greeting's name
 * @param orderRef - the order's human number, or its id when it has none
 * @param refund - the amount that went back, a decimal in `currency`
 * @param full - whether this completes the refund of everything the customer paid
 */
export const refundIssuedEmail = (
    locale: string,
    name: string,
    orderRef: string,
    refund: { amount: number; currency: string },
    full: boolean
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'payments.refund-issued',
        subject: t('payments.email-refunded.subject'),
        data: {
            locale,
            pageMetaTitle: t('payments.email-refunded.meta-title'),
            pageMetaLinks: [],
            greeting: t('payments.email-refunded.greeting', { name }),
            body: t('payments.email-refunded.body', {
                order: orderRef,
                amount: money(locale, refund.amount, refund.currency)
            }),
            detail: t(`payments.email-refunded.${full ? 'detail-full' : 'detail-partial'}`),
            footer: t('email.footer')
        }
    };
};
