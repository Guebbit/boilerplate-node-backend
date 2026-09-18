/**
 * @module
 * The copy of every email this module sends, resolved into finished strings — same rule as
 * `@modules/account/emails`: language is an argument, the output is finished text, a template
 * only interpolates. One email today: the auto-disable notice, sent to whoever created a
 * subscription once repeated failures switch it off.
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';

/**
 * Sent when `services/attempt.ts#recordFailure` auto-disables a subscription — the only audience
 * for this: an operator hearing about their OWN endpoint. Sustained failure across every
 * subscription is a separate, operator-facing signal (the `QueueJobsParked`-style alert on parked
 * deliveries), never this — the two never share a channel.
 *
 * @param locale - the shop's default locale; auto-disable is a system event with no request behind
 *   it to carry the owner's own preference
 * @param url - the disabled subscription's endpoint, so the notice is unambiguous about which one
 */
export const subscriptionDisabledEmail = (locale: string, url: string): EmailContent => {
    const t = translator(locale);
    return {
        template: 'webhooks.subscription-disabled',
        subject: t('webhooks.email-disabled.subject'),
        data: {
            locale,
            pageMetaTitle: t('webhooks.email-disabled.meta-title'),
            pageMetaLinks: [],
            greeting: t('webhooks.email-disabled.greeting'),
            body: t('webhooks.email-disabled.body'),
            url,
            footer: t('email.footer')
        }
    };
};
