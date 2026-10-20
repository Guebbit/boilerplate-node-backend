/**
 * @module
 * The copy of the one mail `users` sends, resolved into finished strings — the language is an
 * argument, the output is finished text, and the template queued behind it only interpolates.
 * Same rule as `@modules/account/emails`; see that file for why.
 *
 * See: docs/modules/users.md#purchase-hold
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';

/** What a buyer is told when a hold is placed on their account. */
export interface PurchaseHoldNotice {
    /** When the pause ends by itself. */
    until: Date;
    /** `repeated_cancellations`: the shop's own rule; `staff`: a person placed it. */
    reason: 'repeated_cancellations' | 'staff';
    /** The rule's numbers; read only for `repeated_cancellations`. */
    cancelCount?: number;
    windowDays?: number;
    /** The note staff wrote for the buyer; absent when they left none. */
    note?: string;
    /** The contact page, and the privacy notice. */
    contactUrl: string;
    privacyUrl: string;
}

/**
 * The end of a hold as one unambiguous line: the date and time with the zone named. `users` may not
 * read the shop's timezone (it is a foundation module), so the instant is stated in UTC.
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
 *
 * @param locale - the recipient's language
 * @param date - the instant
 */
const untilText = (locale: string, date: Date): string =>
    new Intl.DateTimeFormat(locale, {
        // Spelled out field by field: `dateStyle`/`timeStyle` refuse a `timeZoneName`.
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short'
    }).format(date);

/**
 * The mail to a buyer whose checkout was just paused (GDPR Art. 22(3) and Recital 71: told, with
 * the reason, with a way to ask a person). The right to object (Art. 21(4)) is its own paragraph,
 * apart from the rest, as the Article requires.
 *
 * @param locale - the recipient's language
 * @param notice - the end date, the reason, the staff note, and the two links
 */
export const purchaseHoldPlacedEmail = (
    locale: string,
    notice: PurchaseHoldNotice
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'users.purchase-hold-placed',
        subject: t('users.email.purchase-hold.subject'),
        data: {
            locale,
            pageMetaTitle: t('users.email.purchase-hold.meta-title'),
            title: t('users.email.purchase-hold.title'),
            greeting: t('users.email.purchase-hold.greeting'),
            summary: t('users.email.purchase-hold.summary', {
                date: untilText(locale, notice.until)
            }),
            reason: t(`users.email.purchase-hold.reason-${notice.reason}`, {
                count: notice.cancelCount ?? 0,
                days: notice.windowDays ?? 0
            }),
            noteLabel: t('users.email.purchase-hold.note-label'),
            note: notice.note ?? '',
            stillWorks: t('users.email.purchase-hold.still-works'),
            contactIntro: t('users.email.purchase-hold.contact-intro'),
            contactLabel: t('users.email.purchase-hold.contact-label'),
            contactUrl: notice.contactUrl,
            objectionTitle: t('users.email.purchase-hold.objection-title'),
            objection: t('users.email.purchase-hold.objection'),
            privacyLabel: t('users.email.purchase-hold.privacy-label'),
            privacyUrl: notice.privacyUrl,
            footer: t('email.footer')
        }
    };
};
