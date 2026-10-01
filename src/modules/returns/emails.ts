/**
 * @module
 * The copy of the emails this module sends, resolved into finished strings — same rule as
 * `@modules/account/emails`: the language is an argument, the output is finished text, and whatever
 * renders it later resolves nothing.
 *
 * One template (`returns.notice`) carries every notice: a greeting, a body, and a postage line when
 * one applies. What
 * differs between them is copy, and copy lives in the locale files.
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';
import type { ReturnAddress, ReturnPostagePayer } from '@modules/orders';

/** Which notice is being sent. */
export type ReturnNoticeKind =
    | 'withdrawal-acknowledged'
    | 'return-requested'
    | 'return-approved'
    | 'return-declined'
    | 'return-closed';

/** What a notice needs to fill its copy. */
export interface ReturnNoticeInput {
    /** The order's human number, or its id when it has none. */
    orderRef: string;
    /** Who pays to send the goods back — the notice says so, since Art. 14(1) requires telling them. */
    returnPostage: ReturnPostagePayer;
    /** When the customer acted — printed with date AND time, as Art. 11a's acknowledgement requires. */
    at: Date;
    /** Staff's reason, on a decline. */
    declineReason?: string;
    /** What went back, on a closed return. */
    refund?: { amount: number; currency: string };
    /** Where to send the goods, on an approval — absent until the deployment configures one. */
    returnAddress?: ReturnAddress;
}

/**
 * The moment a notice reports, spelled out in full and in UTC — an acknowledgement of a legal act
 * has to say exactly when, and a bare local time is ambiguous across a customer's travels.
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
 */
const stamp = (locale: string, at: Date): string =>
    new Intl.DateTimeFormat(locale, {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'UTC'
    }).format(at);

/**
 * A notice about a return or a withdrawal, in the customer's own language.
 *
 * `withdrawal-acknowledged` is the Art. 11a acknowledgement on a durable medium: it names the
 * order, the exact date and time the withdrawal was received, and who pays the postage.
 *
 * @param kind - which notice
 * @param locale - the recipient's language
 * @param name - the greeting's name
 * @param input - what fills the copy
 */
export const returnNoticeEmail = (
    kind: ReturnNoticeKind,
    locale: string,
    name: string,
    input: ReturnNoticeInput
): EmailContent => {
    const t = translator(locale);
    const parameters = {
        order: input.orderRef,
        date: stamp(locale, input.at),
        reason: input.declineReason ?? '',
        amount: input.refund
            ? new Intl.NumberFormat(locale, {
                  style: 'currency',
                  currency: input.refund.currency
              }).format(input.refund.amount)
            : ''
    };
    // Neither a decline nor a closing says anything about postage — there is nothing left to post.
    const postage =
        kind === 'return-declined' || kind === 'return-closed'
            ? undefined
            : t(`returns.email.postage-${input.returnPostage}`);
    const { returnAddress } = input;
    const address = returnAddress
        ? t('returns.email.return-address', {
              address: [
                  returnAddress.name,
                  returnAddress.street,
                  `${returnAddress.zip} ${returnAddress.city}`,
                  returnAddress.country
              ]
                  .filter(Boolean)
                  .join(', ')
          })
        : undefined;

    return {
        template: 'returns.notice',
        subject: t(`returns.email.${kind}.subject`),
        data: {
            locale,
            pageMetaTitle: t(`returns.email.${kind}.subject`),
            pageMetaLinks: [],
            greeting: t('returns.email.greeting', { name }),
            body: t(`returns.email.${kind}.body`, parameters),
            postage,
            address,
            footer: t('email.footer')
        }
    };
};
