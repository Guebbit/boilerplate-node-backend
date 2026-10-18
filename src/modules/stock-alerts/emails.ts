/**
 * @module
 * The one email this module sends: "back in stock". Finished strings, the language an argument,
 * as in `@modules/account/emails`. One product, a link to it, and nothing else: no other promotion
 * rides on a request the buyer made for this single mail.
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';

/** What the back-in-stock email says. */
export interface BackInStockEmailInput {
    /** The product's name in the recipient's language. */
    title: string;
    /** The product's page on the paired frontend. */
    productUrl: string;
}

/**
 * "It is back": a product the buyer asked about can be ordered again.
 *
 * @param locale - the buyer's language
 * @param name - the buyer's name, for the greeting
 * @param input - the product and where to see it
 */
export const backInStockEmail = (
    locale: string,
    name: string,
    input: BackInStockEmailInput
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'stock-alerts.back-in-stock',
        subject: t('stock-alerts.email-back-in-stock.subject', { title: input.title }),
        data: {
            locale,
            pageMetaTitle: t('stock-alerts.email-back-in-stock.meta-title'),
            greeting: t('stock-alerts.email-back-in-stock.greeting', { name }),
            body: t('stock-alerts.email-back-in-stock.body', { title: input.title }),
            once: t('stock-alerts.email-back-in-stock.once'),
            linkLabel: t('stock-alerts.email-back-in-stock.link-label'),
            linkUrl: input.productUrl,
            footer: t('email.footer')
        }
    };
};
