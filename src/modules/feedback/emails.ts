/**
 * The copy of every email this module sends, resolved into finished strings.
 *
 * Same rule as `@modules/account/emails`: the language is an argument, the output is finished
 * text, and the worker that sends it resolves nothing. See that file for why.
 *
 * One difference worth naming: this notification goes to the support mailbox, not to the person
 * who filled in the form, so its caller passes `NODE_DEFAULT_LOCALE` — the operator's language.
 * The customer's own words pass through untranslated, as they must.
 *
 * No `footer`: this template is the one that does not include the shared footer partial, and a
 * builder returns what its template prints — nothing more.
 */

import type { IEmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';

export interface IContactRequest {
    name?: string;
    email: string;
    subject: string;
    message: string;
    createdAt?: string;
}

/** Operator-facing notification for a new contact request. */
export const contactRequestEmail = (locale: string, feedback: IContactRequest): IEmailContent => {
    const t = translator(locale);
    return {
        template: 'email-feedback-contact.ejs',
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
