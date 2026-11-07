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
    /** Which reminder this is, when it is not the first announcement. */
    reminder?: ContactReminder;
}

/** The two reminders a contact message can earn: it is late, or it is three days from late. */
export type ContactReminder = 'overdue' | 'due-soon';

/**
 * The `[#ref]` of a task: the last eight characters of its id, in a mail subject and on the staff
 * screens, so a mailbox thread can be matched to its task.
 *
 * @param id - the task's id
 */
export const taskRef = (id: string): string => id.slice(-8);

/**
 * Operator-facing notification for a new contact request, or one of its reminders.
 * Carries the plain-text part beside the HTML one.
 */
export const contactRequestEmail = (
    locale: string,
    contact: ContactRequest
): EmailContent & { text: string } => {
    const t = translator(locale);
    const wording = contact.reminder ? `-${contact.reminder}` : '';
    const ref = taskRef(contact.id);
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

/**
 * Operator-facing notice that an erasure deleted contact messages: the `[#ref]`s of the deleted
 * tasks and nothing else (no address, name or text), so the mailbox copies can be found and
 * deleted. Goes to the main mailbox, in `NODE_DEFAULT_LOCALE`.
 *
 * @param locale - the mailbox's language
 * @param ids - the ids of the deleted tasks
 */
export const erasureNoticeEmail = (locale: string, ids: readonly string[]): EmailContent => {
    const t = translator(locale);
    const references = ids.map((id) => `[#${taskRef(id)}]`).join(' ');
    return {
        template: 'tasks.erasure-notice',
        subject: t('tasks.email-erasure.subject', { refs: references }),
        data: {
            locale,
            pageMetaTitle: t('tasks.email-erasure.meta-title'),
            title: t('tasks.email-erasure.title', { refs: references }),
            explain: t('tasks.email-erasure.explain')
        }
    };
};
