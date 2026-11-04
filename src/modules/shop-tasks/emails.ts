/**
 * @module
 * The staff digest mail: one line per summary that appeared or grew, each with a link to the page
 * that lists it, in the recipient's own language. Counts and links only, no names or addresses.
 *
 * See: docs/modules/shop-tasks.md#the-staff-digest
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';
import { frontendLink } from '@infrastructure/http/frontend-link';
import { summaryLinkOf, type SummaryCode } from './staff-routing';

/** One line of the digest mail: a summary row's code and how many it counts. */
export interface DigestItem {
    code: SummaryCode;
    count: number;
}

/**
 * The daily digest mail.
 *
 * @param locale - the recipient's stored language
 * @param items - the summaries to list; never empty
 */
export const staffDigestEmail = (locale: string, items: readonly DigestItem[]): EmailContent => {
    const t = translator(locale);
    return {
        template: 'shop-tasks.staff-digest',
        subject: t('shop-tasks.staff-mail.digest.subject'),
        data: {
            locale,
            pageMetaTitle: t('shop-tasks.staff-mail.digest.meta-title'),
            title: t('shop-tasks.staff-mail.digest.title'),
            lines: items.map(({ code, count }) => {
                const { template, parameters } = summaryLinkOf(code);
                return {
                    // The code is its own dictionary path: `shop-tasks.staff.<n>` → `shop-tasks.staff-mail.digest.<n>`.
                    text: t(code.replace('.staff.', '.staff-mail.digest.'), { n: String(count) }),
                    link: frontendLink(template, locale, parameters)
                };
            })
        }
    };
};
