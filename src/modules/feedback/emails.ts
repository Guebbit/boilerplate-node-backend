/**
 * @module
 * The copy of every email this module sends, resolved into finished strings.
 *
 * Same rule as `@modules/account/emails`: the language is an argument, the output is finished
 * text, the worker resolves nothing — see that file for why. This notification goes to the
 * support mailbox, so it renders in `NODE_DEFAULT_LOCALE` while the customer's own words stay
 * untranslated; it also has no `footer`, the one template that skips the shared partial.
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
export const contactRequestEmail = (locale: string, feedback: ContactRequest): EmailContent => {
    const t = translator(locale);
    return {
        template: 'feedback.contact',
        // The ticket's own subject is appended to the translated prefix, so an operator scanning
        // the mailbox reads what it is about without opening it.
        subject: `${t('feedback.email-contact.subject')}: ${feedback.subject}`,
        data: {
            locale,
            pageMetaTitle: t('feedback.email-contact.meta-title'),
            pageMetaLinks: [],
            title: t('feedback.email-contact.title'),
            labelName: t('feedback.email-contact.label-name'),
            labelEmail: t('feedback.email-contact.label-email'),
            labelSubject: t('feedback.email-contact.label-subject'),
            labelMessage: t('feedback.email-contact.label-message'),
            labelCreatedAt: t('feedback.email-contact.label-created-at'),
            // The fallback lives here rather than in the markup: a template that only
            // interpolates has no way to choose between a value and a translated placeholder.
            name: feedback.name || t('feedback.email-contact.not-available'),
            email: feedback.email,
            subject: feedback.subject,
            message: feedback.message,
            createdAt: feedback.createdAt
        }
    };
};
