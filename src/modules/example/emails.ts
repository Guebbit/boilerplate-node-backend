/**
 * @module
 * Optional capability, in its own files: the mail the owner gets when an example is published.
 * In any module, this file is where each mail's copy is turned into finished strings: the language
 * is an argument, the output is text, and whatever renders the template later resolves nothing.
 *
 * See: docs/tools/email-and-rendering.md
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';

/**
 * The mail telling an owner their example is now public.
 * @param locale - the owner's own language
 * @param name - the greeting's name
 * @param title - the published example's title
 */
export const examplePublishedEmail = (
    locale: string,
    name: string,
    title: string
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'example.published',
        subject: t('example.email-published.subject', { title }),
        data: {
            locale,
            pageMetaTitle: t('example.email-published.subject', { title }),
            pageMetaLinks: [],
            greeting: t('example.email-published.greeting', { name }),
            body: t('example.email-published.body', { title }),
            footer: t('email.footer')
        }
    };
};
