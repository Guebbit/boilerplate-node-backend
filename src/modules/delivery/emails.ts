/**
 * @module
 * The copy of the emails this module sends, resolved into finished strings — same rule as
 * `@modules/account/emails`: the language is an argument, the output is finished text, and
 * whatever renders it later resolves nothing. See that file for why.
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';

/**
 * "Your order is on its way" — sent when an order reaches `shipped`. The tracking line only
 * appears when the method actually carries one; `undefined` here still reads as "unset" to the
 * template's own `typeof tracking !== "undefined"` guard, same convention
 * `bankTransferInstructionsEmail`'s optional fields already follow.
 */
export const shipmentShippedEmail = (
    locale: string,
    name: string,
    trackingCode: string | undefined
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'delivery.shipment-shipped',
        subject: t('delivery.email-shipped.subject'),
        data: {
            locale,
            pageMetaTitle: t('delivery.email-shipped.meta-title'),
            pageMetaLinks: [],
            greeting: t('delivery.email-shipped.greeting', { name }),
            body: t('delivery.email-shipped.body'),
            tracking: trackingCode
                ? t('delivery.email-shipped.tracking', { code: trackingCode })
                : undefined,
            footer: t('email.footer')
        }
    };
};
