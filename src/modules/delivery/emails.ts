/**
 * @module
 * The copy of the emails this module sends, resolved into finished strings — same rule as
 * `@modules/account/emails`: the language is an argument, the output is finished text, and
 * whatever renders it later resolves nothing. See that file for why.
 *
 * Two emails, one per shipment: "on its way" when it leaves, "arrived" when it is delivered.
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';

/** A line of a shipment, as the email lists it. */
export interface EmailLine {
    title: string;
    quantity: number;
}

/** What the shipped email says about this shipment. */
export interface ShippedEmailInput {
    /** What the shipment carries. */
    lines: readonly EmailLine[];
    /** The carrier's code; absent for a method that carries no tracking. */
    trackingCode?: string | undefined;
    /** Units of the order still to come in later shipments; `0` when this one completes it. */
    remainingUnits: number;
}

/** What the delivered email says about this shipment. */
export interface DeliveredEmailInput {
    /** What arrived. */
    lines: readonly EmailLine[];
    /** The last day a withdrawal is valid — present only on the delivery that completes the order. */
    withdrawUntil?: Date | undefined;
}

/**
 * The product lines as printed text: "2 × Title". The numbers and the title are data, not copy.
 * @param t - the translator for the email's language
 * @param lines - what the shipment carries
 */
const lineTexts = (t: ReturnType<typeof translator>, lines: readonly EmailLine[]): string[] =>
    lines.map(({ title, quantity }) => t('delivery.email-line', { quantity, title }));

/**
 * "Your order is on its way" — sent when a shipment leaves. Lists what is in it, the tracking line
 * only when the method actually carries one (`undefined` still reads as "unset" to the template's
 * own `typeof tracking !== "undefined"` guard, same convention `bankTransferInstructionsEmail`'s
 * optional fields follow), and how many more items are to follow when anything remains.
 * @param locale - the buyer's language
 * @param name - the buyer's name, for the greeting
 * @param input - the shipment's lines, tracking and what remains
 */
export const shipmentShippedEmail = (
    locale: string,
    name: string,
    input: ShippedEmailInput
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
            lines: lineTexts(t, input.lines),
            tracking: input.trackingCode
                ? t('delivery.email-shipped.tracking', { code: input.trackingCode })
                : undefined,
            more:
                input.remainingUnits > 0
                    ? t('delivery.email-shipped.more', { count: input.remainingUnits })
                    : undefined,
            footer: t('email.footer')
        }
    };
};

/**
 * "Your shipment arrived" — sent when a shipment is delivered. On the delivery that completes the
 * order it also says until when the buyer may withdraw: the window runs from the last good
 * (CRD Art. 9(2)(b)(i)).
 * @param locale - the buyer's language
 * @param name - the buyer's name, for the greeting
 * @param input - what arrived and, when it was the last, the withdrawal deadline
 */
export const shipmentDeliveredEmail = (
    locale: string,
    name: string,
    input: DeliveredEmailInput
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'delivery.shipment-delivered',
        subject: t('delivery.email-delivered.subject'),
        data: {
            locale,
            pageMetaTitle: t('delivery.email-delivered.meta-title'),
            pageMetaLinks: [],
            greeting: t('delivery.email-delivered.greeting', { name }),
            body: t('delivery.email-delivered.body'),
            lines: lineTexts(t, input.lines),
            // `Intl.DateTimeFormat`, UTC: the deadline is a UTC calendar day, so a local rendering
            // could print the day before. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
            withdraw: input.withdrawUntil
                ? t('delivery.email-delivered.withdraw-until', {
                      date: new Intl.DateTimeFormat(locale, {
                          dateStyle: 'long',
                          timeZone: 'UTC'
                      }).format(input.withdrawUntil)
                  })
                : undefined,
            footer: t('email.footer')
        }
    };
};
