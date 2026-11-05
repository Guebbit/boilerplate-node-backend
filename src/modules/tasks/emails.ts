/**
 * @module
 * The copy of every email this module sends, resolved into finished strings — same rule as
 * `@modules/account/emails`: language is an argument, output is finished text. Goes to the
 * main mailbox (`NODE_SUPPORT_EMAIL`), so it renders in `NODE_DEFAULT_LOCALE`; the customer's own
 * words stay untranslated, and it skips the shared `footer` partial.
 *
 * See: docs/tools/email-and-rendering.md
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';
import { FRONTEND_LINK_RULES, frontendLink } from '@infrastructure/http/frontend-link';

/** The fields the contact form collects, plus the timestamp stamped on create. */
export interface ContactRequest {
    /** The task's id: its last eight characters are the `[#ref]` in the subject. */
    id: string;
    name?: string;
    email: string;
    subject: string;
    message: string;
    category?: string;
    orderNumber?: string;
    createdAt?: string;
    /** The reminder for a message nobody answered in time, not the first announcement. */
    overdue?: boolean;
}

/**
 * Operator-facing notification for a new contact request, or the reminder that it is overdue.
 * Carries the plain-text part beside the HTML one.
 */
export const contactRequestEmail = (
    locale: string,
    contact: ContactRequest
): EmailContent & { text: string } => {
    const t = translator(locale);
    const wording = contact.overdue ? '-overdue' : '';
    const ref = contact.id.slice(-8);
    const category = t(`tasks.task-category.${contact.category ?? 'none'}`);
    const link = frontendLink(FRONTEND_LINK_RULES.staffPages.task, locale, { id: contact.id });
    // `[privacy]`: a data-protection request owes an answer within a month, so it is findable
    // in the mailbox at a glance.
    const tags = contact.category === 'privacy' ? ' [privacy]' : '';
    const orderNumber = contact.orderNumber ?? t('tasks.email-contact.not-available');
    const title = t(`tasks.email-contact.title${wording}`, { ref, email: contact.email });
    return {
        template: 'tasks.contact',
        // `[#ref]` keeps one message's mails together; the task's own subject is appended to the
        // translated prefix, so an operator scanning the mailbox reads what it is about.
        subject: `${t(`tasks.email-contact.subject${wording}`)} [#${ref}]${tags}: ${contact.subject}`,
        text: [
            title,
            '',
            `${t('tasks.email-contact.label-name')}: ${contact.name || t('tasks.email-contact.not-available')}`,
            `${t('tasks.email-contact.label-email')}: ${contact.email}`,
            `${t('tasks.email-contact.label-subject')}: ${contact.subject}`,
            `${t('tasks.email-contact.label-category')}: ${category}`,
            `${t('tasks.email-contact.label-order-number')}: ${orderNumber}`,
            '',
            contact.message,
            '',
            `${t('tasks.email-contact.label-link')}: ${link}`
        ].join('\n'),
        data: {
            locale,
            pageMetaTitle: t('tasks.email-contact.meta-title'),
            title,
            labelName: t('tasks.email-contact.label-name'),
            labelEmail: t('tasks.email-contact.label-email'),
            labelSubject: t('tasks.email-contact.label-subject'),
            labelCategory: t('tasks.email-contact.label-category'),
            labelOrderNumber: t('tasks.email-contact.label-order-number'),
            labelLink: t('tasks.email-contact.label-link'),
            labelMessage: t('tasks.email-contact.label-message'),
            labelCreatedAt: t('tasks.email-contact.label-created-at'),
            // The fallback lives here rather than in the markup: a template that only
            // interpolates has no way to choose between a value and a translated placeholder.
            name: contact.name || t('tasks.email-contact.not-available'),
            email: contact.email,
            subject: contact.subject,
            message: contact.message,
            category,
            orderNumber,
            link,
            createdAt: contact.createdAt
        }
    };
};
