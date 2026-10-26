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
    const named = { ...body.params };
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
