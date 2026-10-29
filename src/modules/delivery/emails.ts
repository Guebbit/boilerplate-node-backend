/**
 * @module
 * The copy of the emails this module sends, resolved into finished strings — same rule as
 * `@modules/account/emails`: the language is an argument, the output is finished text, and
 * whatever renders it later resolves nothing. See that file for why.
 *
 * Two emails, one per shipment: "on its way" when it leaves, "arrived" when it is delivered; and
 * the one a parcel reported lost earns.
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';
import type { FulfillmentHeldParamsNotice, ShipmentLostReason } from '@types';
import { shopTimezone } from '@modules/shop';

/** A line of a shipment, as the email lists it. */
export interface EmailLine {
    title: string;
    quantity: number;
}

/** Why a shipped mail is sent again after the shipment left. */
export type TrackingVariant = 'added' | 'corrected';

/** What the shipped email says about this shipment. */
export interface ShippedEmailInput {
    /** What the shipment carries. */
    lines: readonly EmailLine[];
    /** The carrier's code; absent for a method that carries no tracking. */
    trackingCode?: string | undefined;
    /** Units of the order still to come in later shipments; `0` when this one completes it. */
    remainingUnits: number;
    /**
     * Set when the mail follows a code change: `added` for the first code of a shipment that left
     * without one, `corrected` for a replacement of one already sent. Each has its own subject and body.
     */
    variant?: TrackingVariant | undefined;
}

/** What the delivered email says about this shipment. */
export interface DeliveredEmailInput {
    /** What arrived. */
    lines: readonly EmailLine[];
    /** The last day a withdrawal is valid — present only on the delivery that completes the order. */
    withdrawUntil?: Date | undefined;
}

/** What the lost-parcel email says. */
export interface LostEmailInput {
    /** Lost by the carrier, or damaged in transit. */
    reason: ShipmentLostReason;
    /** What the parcel carried. */
    lines: readonly EmailLine[];
    /** The units the shelf could not cover again; empty when everything ships again from the shelf. */
    owed: readonly EmailLine[];
    /** When the owed units are expected; present exactly when `owed` is not empty. */
    expectedAt?: Date | undefined;
    /** What staff wrote for the buyer, if anything. */
    message?: string | undefined;
    /** The order page, where the buyer reads the same and can cancel the rest. */
    orderUrl: string;
}

/** What the fulfillment-delayed email says about one waiting fulfillment order. */
export interface FulfillmentDelayedEmailInput {
    /** The waiting products' titles, as the order froze them. */
    titles: readonly string[];
    /** The date promised when ordering. */
    agreedAt: Date;
    /** The date now expected; absent when there is none. */
    expectedAt?: Date | undefined;
    /** `moved`: the date changed. `due`: it will be missed (a day away or gone) and the goods are still not here. */
    reason: 'moved' | 'due';
    /** The buyer's own order page, where Cancel is. */
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
            input.variant
                ? `delivery.email-shipped.${input.variant}-subject`
                : 'delivery.email-shipped.subject'
        ),
        data: {
            locale,
            pageMetaTitle: t('delivery.email-shipped.meta-title'),
            greeting: t('delivery.email-shipped.greeting', { name }),
            body: t(
                input.variant
                    ? `delivery.email-shipped.${input.variant}-body`
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

/**
 * "Part of your order did not reach you" — sent when staff report a parcel lost or damaged in
 * transit. A fixed text per reason, the units still owed with the date they are expected (when the
 * shelf could not cover them), and staff's sentence in a blockquote when they wrote one. Never says
 * what staff noted for colleagues.
 *
 * @param locale - the buyer's language
 * @param name - the buyer's name, for the greeting
 * @param input - the reason, the parcel's lines, what is owed and staff's message
 */
export const shipmentLostEmail = (
    locale: string,
    name: string,
    input: LostEmailInput
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'delivery.shipment-lost',
        subject: t(`delivery.email-lost.${input.reason}.subject`),
        data: {
            locale,
            pageMetaTitle: t('delivery.email-lost.meta-title'),
            greeting: t('delivery.email-lost.greeting', { name }),
            body: t(`delivery.email-lost.${input.reason}.body`),
            lines: lineTexts(t, input.lines),
            promise: t('delivery.email-lost.promise'),
            owedIntro:
                input.owed.length > 0 && input.expectedAt
                    ? t('delivery.email-lost.owed', { date: longDate(locale, input.expectedAt) })
                    : '',
            owedLines: lineTexts(t, input.owed),
            // Always a string: the job crosses the queue as JSON, which drops an `undefined` key.
            message: input.message ?? '',
            linkLabel: t('delivery.email-lost.link-label'),
            linkUrl: input.orderUrl,
            footer: t('email.footer')
        }
    };
};

/** What the hold-notice email says. */
export interface HoldNoticeEmailInput {
    /** `check_address`: the buyer can fix something; `delayed`: a plain delay. */
    notice: FulfillmentHeldParamsNotice;
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
            // Always a string: the job crosses the queue as JSON, which drops an `undefined` key, and
            // the template reads `message` unconditionally (a missing key is a ReferenceError).
            message: input.message ?? '',
            linkLabel: t('delivery.email-hold-notice.link-label'),
            linkUrl: input.orderUrl,
            footer: t('email.footer')
        }
    };
};

/**
 * "Part of your order will be late" — sent when a waiting fulfillment order's date moved or will be missed.
 * Three wordings, one per thing that happened: a new date, a date taken away (none yet), and a date
 * that is here with no stock. Every one closes the same way: the buyer may cancel for a full refund
 * until it ships, and doing nothing means they keep waiting. The shop asks nothing.
 *
 * @param locale - the buyer's language
 * @param name - the buyer's name, for the greeting
 * @param input - what changed
 */
export const fulfillmentDelayedEmail = (
    locale: string,
    name: string,
    input: FulfillmentDelayedEmailInput
): EmailContent => {
    const t = translator(locale);
    const variant = input.reason === 'due' ? 'passed' : input.expectedAt ? 'moved' : 'cleared';
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
            closing: t('delivery.email-fulfillment-delayed.cancel-any-time'),
            linkLabel: t('delivery.email-fulfillment-delayed.link-label'),
            linkUrl: input.orderUrl,
            footer: t('email.footer')
        }
    };
};
