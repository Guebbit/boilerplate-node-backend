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
import { formatMoney } from '@domain-primitives/money';
import { addressLine } from '@modules/shop';
import type { ReturnPostagePayer, ShopAddress } from '@types';

/** Which notice is being sent. */
export type ReturnNoticeKind =
    | 'withdrawal-acknowledged'
    | 'withdrawal-recorded'
    | 'return-requested'
    | 'return-opened'
    | 'return-approved'
    | 'return-declined'
    | 'return-closed';

/** What a notice needs to fill its copy. */
export interface ReturnNoticeInput {
    /** The order's human number, or its id when it has none. */
    orderRef: string;
    /**
     * Who pays to send the goods back — the notice says so, since Art. 14(1) requires telling them.
     * Absent when no goods are expected back (a withdrawal before dispatch), so no postage line.
     */
    returnPostage?: ReturnPostagePayer;
    /** When the customer acted — printed with date AND time, as Art. 11a's acknowledgement requires. */
    at: Date;
    /** How a withdrawal the shop recorded for them was stated, and when the shop wrote it down. */
    recorded?: { via: string; at: Date };
    /** The code staff declined with; the sentence is the buyer's own language. */
    declineReason?: string;
    /** What staff wrote to the buyer beside the code, when they did. */
    declineMessage?: string | undefined;
    /** What went back, on a closed return. */
    refund?: { amount: number; currency: string };
    /** Where to send the goods, on an approval. */
    returnAddress?: ShopAddress;
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
 * The decline's reason as the buyer reads it: the code's sentence in their language, then staff's
 * message when there is one. The message is staff's own words and stays in staff's language.
 * @param t - the recipient's translator
 * @param input - the notice's inputs
 */
const declineSentence = (t: ReturnType<typeof translator>, input: ReturnNoticeInput): string => {
    if (!input.declineReason) return '';
    const sentence = t(`returns.email.decline-reason.${input.declineReason}`);
    return input.declineMessage ? `${sentence} ${input.declineMessage}` : sentence;
};

/**
 * A notice about a return or a withdrawal, in the customer's own language.
 *
 * `withdrawal-acknowledged` is the Art. 11a acknowledgement on a durable medium: it names the
 * order, the exact date and time the withdrawal was received, and who pays the postage.
 * `withdrawal-recorded` is the same for one staff wrote down: the day the buyer stated it, the
 * channel, and the day the shop recorded it — the buyer's dated proof (Art. 11(4)).
 * `return-opened` tells a buyer staff opened a return for them after their request.
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
        recorded: input.recorded ? stamp(locale, input.recorded.at) : '',
        via: input.recorded ? t(`returns.email.via-${input.recorded.via}`) : '',
        reason: declineSentence(t, input),
        amount: input.refund ? formatMoney(locale, input.refund.amount, input.refund.currency) : ''
    };
    // Neither a decline nor a closing says anything about postage — there is nothing left to post.
    const postage =
        kind === 'return-declined' || kind === 'return-closed' || !input.returnPostage
            ? undefined
            : t(`returns.email.postage-${input.returnPostage}`);
    const { returnAddress } = input;
    const address = returnAddress
        ? t('returns.email.return-address', { address: addressLine(returnAddress) })
        : undefined;

    return {
        template: 'returns.notice',
        subject: t(`returns.email.${kind}.subject`),
        data: {
            locale,
            pageMetaTitle: t(`returns.email.${kind}.subject`),
            greeting: t('returns.email.greeting', { name }),
            body: t(`returns.email.${kind}.body`, parameters),
            postage,
            address,
            footer: t('email.footer')
        }
    };
};
