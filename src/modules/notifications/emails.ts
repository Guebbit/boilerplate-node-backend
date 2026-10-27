/**
 * @module
 * The one email a work notice can send: a short "what happened" and a link to the screen where it
 * is dealt with, in the recipient's own language. Only codes whose route says `email: 'now'` have
 * copy here; the others are the bell's alone.
 *
 * See: docs/modules/notifications.md#work-notices-for-staff
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';
import { frontendLink } from '@infrastructure/http/frontend-link';
import { staffLinkOf, type StaffNoticeBody } from './staff-routing';

/**
 * The words a ticket mail names the ticket by: its kind, and for a contact message its category.
 * Both are closed codes, so the mail carries nothing the visitor typed.
 *
 * @param t - the recipient's translator
 * @param parameters - the ticket notice's params
 */
const ticketWhat = (
    t: ReturnType<typeof translator>,
    parameters: { kind: string; category?: string }
): string => {
    const kind = t(`notifications.staff-mail.ticket-kind.${parameters.kind}`);
    if (parameters.kind !== 'contact') return kind;
    // "Uncategorised" when the visitor chose none: the mail must not look broken.
    const category = parameters.category
        ? t(`notifications.staff-mail.ticket-category.${parameters.category}`)
        : t('notifications.staff-mail.ticket-category.none');
    return `${kind} · ${category}`;
};

/**
 * The extra words a code's copy interpolates, beyond its params.
 *
 * @param t - the recipient's translator
 * @param body - the notice
 */
const wordsOf = (
    t: ReturnType<typeof translator>,
    body: StaffNoticeBody
): Record<string, string> => {
    switch (body.code) {
        case 'notifications.staff.ticket-opened':
        case 'notifications.staff.ticket-assigned': {
            return { what: ticketWhat(t, body.params) };
        }
        case 'notifications.staff.purchase-hold-placed':
        case 'notifications.staff.webhook-disabled': {
            return {};
        }
    }
};

/**
 * The finished mail for a work notice.
 *
 * @param locale - the recipient's stored language
 * @param body - the notice; its code picks the wording, its params fill it
 */
export const staffNoticeEmail = (locale: string, body: StaffNoticeBody): EmailContent => {
    const t = translator(locale);
    const { template, parameters } = staffLinkOf(body);
    // The code is its own dictionary path: `notifications.staff.<kind>` → `notifications.staff-mail.<kind>`.
    const wording = body.code.replace('notifications.staff.', 'notifications.staff-mail.');
    const named = { ...body.params, ...wordsOf(t, body) };
    return {
        template: 'notifications.staff-notice',
        subject: t(`${wording}.subject`, named),
        data: {
            locale,
            pageMetaTitle: t(`${wording}.meta-title`),
            title: t(`${wording}.title`),
            summary: t(`${wording}.summary`, named),
            link: frontendLink(template, locale, parameters),
            linkLabel: t('notifications.staff-mail.open')
        }
    };
};
