/**
 * @module
 * The copy of every email this module sends, resolved into finished strings — same rule as
 * `@modules/account/emails`: language is an argument, output is finished text. Goes to the
 * support mailbox, so it renders in `NODE_DEFAULT_LOCALE`; the customer's own words stay
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
    createdAt?: string;
}

/** Operator-facing notification for a new contact request. */
export const contactRequestEmail = (locale: string, contact: ContactRequest): EmailContent => {
    const t = translator(locale);
    return {
        template: 'tickets.contact',
        // The ticket's own subject is appended to the translated prefix, so an operator scanning
        // the mailbox reads what it is about without opening it.
        subject: `${t('tickets.email-contact.subject')}: ${contact.subject}`,
        data: {
            locale,
            pageMetaTitle: t('tickets.email-contact.meta-title'),
            title: t('tickets.email-contact.title'),
            labelName: t('tickets.email-contact.label-name'),
            labelEmail: t('tickets.email-contact.label-email'),
            labelSubject: t('tickets.email-contact.label-subject'),
            labelMessage: t('tickets.email-contact.label-message'),
            labelCreatedAt: t('tickets.email-contact.label-created-at'),
            // The fallback lives here rather than in the markup: a template that only
            // interpolates has no way to choose between a value and a translated placeholder.
            name: contact.name || t('tickets.email-contact.not-available'),
            email: contact.email,
            subject: contact.subject,
            message: contact.message,
            createdAt: contact.createdAt
        }
    };
};
