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
import { shopTimezone } from '@modules/shop';

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
    /** The mail corrects a code already sent: its own subject and an apology for the earlier one. */
    corrected?: boolean | undefined;
}

/** What the delivered email says about this shipment. */
export interface DeliveredEmailInput {
    /** What arrived. */
    lines: readonly EmailLine[];
    /** The last day a withdrawal is valid — present only on the delivery that completes the order. */
    withdrawUntil?: Date | undefined;
}

/** What the fulfillment-delayed email says about one waiting fulfillment order. */
export interface FulfillmentDelayedEmailInput {
    /** The waiting products' titles, as the order froze them. */
    titles: readonly string[];
    /** The date promised when ordering. */
    agreedAt: Date;
    /** The date now expected; absent when there is none. */
    expectedAt?: Date | undefined;
    /** Whether the buyer must answer, or silence cancels. */
    needsAnswer: boolean;
    /** When silence turns into a cancel; present when `needsAnswer`. */
    answerBy?: Date | undefined;
    /** The buyer's own order page, where Keep waiting and Cancel are. */
    orderUrl: string;
}

/**
 * A date as the buyer reads it: long, in their language, on the shop's calendar (staff type a day
 * on the shop's wall clock, and UTC would print the evening before it).
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
 * @param locale - the buyer's language
 * @param date - the date
 */
const longDate = (locale: string, date: Date): string =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: shopTimezone() }).format(date);

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
 * own `typeof tracking !== "undefined"` guard, same convention `payments`' `transferInstructionsEmail`'s
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
        subject: t(
            input.corrected
                ? 'delivery.email-shipped.corrected-subject'
                : 'delivery.email-shipped.subject'
        ),
        data: {
            locale,
            pageMetaTitle: t('delivery.email-shipped.meta-title'),
            greeting: t('delivery.email-shipped.greeting', { name }),
            body: t(
                input.corrected
                    ? 'delivery.email-shipped.corrected-body'
                    : 'delivery.email-shipped.body'
            ),
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

/** What the hold-notice email says. */
export interface HoldNoticeEmailInput {
    /** `check_address`: the buyer can fix something; `delayed`: a plain delay. */
    notice: 'check_address' | 'delayed';
    /** What staff wrote for the buyer, if anything. */
    message?: string | undefined;
    /** The order page, where the buyer reads the same and acts. */
    orderUrl: string;
}

/**
 * "Part of your order is on hold" — sent when a hold gives the buyer something to do or read.
 * Never says why staff held it: an address hold asks the buyer to check the address, and a
 * held-for-a-check order says only that it is delayed, plus the sentence staff wrote for them.
 *
 * @param locale - the buyer's language
 * @param name - the buyer's name, for the greeting
 * @param input - the notice, staff's message and the link
 */
export const holdNoticeEmail = (
    locale: string,
    name: string,
    input: HoldNoticeEmailInput
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'delivery.hold-notice',
        subject: t(`delivery.email-hold-notice.${input.notice}.subject`),
        data: {
            locale,
            pageMetaTitle: t('delivery.email-hold-notice.meta-title'),
            greeting: t('delivery.email-hold-notice.greeting', { name }),
            body: t(`delivery.email-hold-notice.${input.notice}.body`),
            message: input.message,
            linkLabel: t('delivery.email-hold-notice.link-label'),
            linkUrl: input.orderUrl,
            footer: t('email.footer')
        }
    };
};

/**
 * "Part of your order will be late" — sent when a waiting fulfillment order's date moved or passed. Three
 * wordings, one per thing the buyer is owed: a short slip (the new date, and cancel is open;
 * silence keeps waiting), a long or repeated one (the new date and a question), and a date that
 * came with no stock (a question with no new date). A question always says by when to answer and
 * what silence does, because that is what makes silence a lawful cancel.
 *
 * @param locale - the buyer's language
 * @param name - the buyer's name, for the greeting
 * @param input - what changed and what the buyer may do about it
 */
export const fulfillmentDelayedEmail = (
    locale: string,
    name: string,
    input: FulfillmentDelayedEmailInput
): EmailContent => {
    const t = translator(locale);
    const variant = input.needsAnswer ? (input.expectedAt ? 'ask-moved' : 'ask-passed') : 'moved';
    return {
        template: 'delivery.fulfillment-delayed',
        subject: t(`delivery.email-fulfillment-delayed.${variant}.subject`),
        data: {
            locale,
            pageMetaTitle: t('delivery.email-fulfillment-delayed.meta-title'),
            greeting: t('delivery.email-fulfillment-delayed.greeting', { name }),
            body: t(`delivery.email-fulfillment-delayed.${variant}.body`, {
                agreed: longDate(locale, input.agreedAt),
                expected: input.expectedAt ? longDate(locale, input.expectedAt) : ''
            }),
            lines: [...input.titles],
            answer:
                input.needsAnswer && input.answerBy
                    ? t('delivery.email-fulfillment-delayed.answer', {
                          date: longDate(locale, input.answerBy)
                      })
                    : t('delivery.email-fulfillment-delayed.cancel-any-time'),
            linkLabel: t('delivery.email-fulfillment-delayed.link-label'),
            linkUrl: input.orderUrl,
            footer: t('email.footer')
        }
    };
};
