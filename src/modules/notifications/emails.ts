/**
 * @module
 * The one email a work notice can send: a short "what happened" and a link to the screen where it
 * is dealt with, in the recipient's own language. Only a notice whose route says `email: 'now'` is
 * mailed; the others are the bell's alone. The wording is the notice code's own dictionary path, so
 * a module that adds notices ships its copy beside them.
 *
 * See: docs/modules/notifications.md#work-notices-for-staff
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';
import { frontendLink } from '@infrastructure/http/frontend-link';
import type { StaffLink, StaffNoticeBody } from './staff-routing';

/**
 * The words a task mail names the task by: its kind, and for a contact message its category.
 * Both are closed codes, so the mail carries nothing the visitor typed.
 *
 * @param t - the recipient's translator
 * @param parameters - the task notice's params
 */
const taskWhat = (
    t: ReturnType<typeof translator>,
    parameters: { kind: string; category?: string }
): string => {
    const kind = t(`notifications.staff-mail.task-kind.${parameters.kind}`);
    if (parameters.kind !== 'contact') return kind;
    // "Uncategorised" when the visitor chose none: the mail must not look broken.
    const category = parameters.category
        ? t(`notifications.staff-mail.task-category.${parameters.category}`)
        : t('notifications.staff-mail.task-category.none');
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
): Record<string, string> =>
    body.code === 'notifications.staff.task-opened' ||
    body.code === 'notifications.staff.task-overdue' ||
    body.code === 'notifications.staff.task-assigned'
        ? { what: taskWhat(t, body.params) }
        : {};

/**
 * The finished mail for a work notice.
 *
 * @param locale - the recipient's stored language
 * @param body - the notice; its code picks the wording, its params fill it
 * @param link - the screen the mail opens, handed over by whoever wrote the notice
 */
export const staffNoticeEmail = (
    locale: string,
    body: StaffNoticeBody,
    link: StaffLink
): EmailContent => {
    const t = translator(locale);
    const { template, parameters } = link;
    // The code is its own dictionary path: `<module>.staff.<kind>` → `<module>.staff-mail.<kind>`.
    const wording = body.code.replace('.staff.', '.staff-mail.');
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
