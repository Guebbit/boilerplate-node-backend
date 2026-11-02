/**
 * @module
 * The copy of every email this module sends, resolved into finished strings — same rule as
 * `@modules/account/emails`: language is an argument, output is finished text. Goes to the
 * fallback mailbox, so it renders in `NODE_DEFAULT_LOCALE`; the customer's own words stay
 * untranslated, and it skips the shared `footer` partial.
 *
 * See: docs/tools/email-and-rendering.md
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';

/** The fields the contact form collects, plus the timestamp stamped on create. */
export interface ContactRequest {
    name?: string;
    email: string;
    subject: string;
    message: string;
    category?: string;
    createdAt?: string;
    /** The reminder for a message nobody answered in time, not the first announcement. */
    overdue?: boolean;
}

/** Operator-facing notification for a new contact request, or the reminder that it is overdue. */
export const contactRequestEmail = (locale: string, contact: ContactRequest): EmailContent => {
    const t = translator(locale);
    const wording = contact.overdue ? '-overdue' : '';
    return {
        template: 'tasks.contact',
        // The task's own subject is appended to the translated prefix, so an operator scanning
        // the mailbox reads what it is about without opening it.
        subject: `${t(`tasks.email-contact.subject${wording}`)}: ${contact.subject}`,
        data: {
            locale,
            pageMetaTitle: t('tasks.email-contact.meta-title'),
            title: t(`tasks.email-contact.title${wording}`),
            labelName: t('tasks.email-contact.label-name'),
            labelEmail: t('tasks.email-contact.label-email'),
            labelSubject: t('tasks.email-contact.label-subject'),
            labelCategory: t('tasks.email-contact.label-category'),
            labelMessage: t('tasks.email-contact.label-message'),
            labelCreatedAt: t('tasks.email-contact.label-created-at'),
            // The fallback lives here rather than in the markup: a template that only
            // interpolates has no way to choose between a value and a translated placeholder.
            name: contact.name || t('tasks.email-contact.not-available'),
            email: contact.email,
            subject: contact.subject,
            message: contact.message,
            category: contact.category ?? t('tasks.email-contact.not-available'),
            createdAt: contact.createdAt
        }
    };
};
