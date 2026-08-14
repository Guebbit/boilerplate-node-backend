/**
 * The copy of the emails this module sends, resolved into finished strings.
 *
 * Same rule as `@modules/account/emails`: the language is an argument, the output is finished
 * text, and whatever renders it later resolves nothing. See that file for why.
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';

/** "Your order is on its way", tracking code included — sent when an order reaches `shipped`. */
export const shipmentShippedEmail = (
    locale: string,
    name: string,
    trackingCode: string
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'delivery.shipment-shipped.ejs',
        subject: t('delivery.email-shipped.subject'),
        data: {
            locale,
            pageMetaTitle: t('delivery.email-shipped.meta-title'),
            pageMetaLinks: [],
            greeting: t('delivery.email-shipped.greeting', { name }),
            body: t('delivery.email-shipped.body'),
            tracking: t('delivery.email-shipped.tracking', { code: trackingCode }),
            footer: t('email.footer')
        }
    };
};
