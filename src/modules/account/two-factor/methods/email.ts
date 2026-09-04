/**
 * @module
 * The email handler: a delivered method, so setup and login both reduce to "mint a code, mail it,
 * remember its digest". The code's lifetime, cooldown and attempt ceiling live in
 * `../delivered-codes.ts` — shared with every future channel, since none of that is specific to
 * email.
 */

import { getDefaultLocale, t } from '@infrastructure/i18n';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { isDemoMode } from '@infrastructure/adapters/demo-outbox';
import type { CallerContext } from '@infrastructure/http/request';
import type { TwoFactorMethodRecord, UserDocument } from '@modules/users';
import type { TwoFactorDelivery } from '@types';
import { twoFactorCodeEmail } from '../../emails';
import type { TwoFactorMethodHandler } from '../registry';
import {
    armDeliveredCode,
    consumeDeliveredCode,
    generateDeliveredCode,
    DELIVERED_CODE_RESEND_SECONDS,
    DELIVERED_CODE_TTL_MS
} from '../delivered-codes';

/**
 * `ada.lovelace@example.com` → `a***e@example.com`. Enough for the owner to recognise the
 * mailbox, not enough for anyone else to learn an address from. Masked here rather than in a
 * client, so two clients cannot redact the same address two different ways.
 */
const maskEmail = (email: string): string => {
    const [local = '', domain = ''] = email.split('@');
    if (local.length <= 2) return `${'*'.repeat(local.length)}@${domain}`;
    return `${local[0]}***${local.at(-1)}@${domain}`;
};

/**
 * Mint a code, arm it on the entry, and queue the mail carrying it.
 * Mutates `entry`; the calling service persists it.
 */
const deliver = (
    user: UserDocument,
    entry: TwoFactorMethodRecord,
    context: CallerContext
): Promise<TwoFactorDelivery> => {
    const code = generateDeliveredCode();
    armDeliveredCode(entry, code);

    // The recipient's OWN language, exactly as the verification and reset mails choose theirs:
    // the copy is finished before the job is published, so the worker needs no locale at all.
    const mail = twoFactorCodeEmail(
        user.locale ?? context.locale ?? getDefaultLocale(),
        user.username,
        code,
        Math.round(DELIVERED_CODE_TTL_MS / 60_000)
    );

    // High priority: someone is sitting on a login screen waiting for this, not reading a digest.
    return enqueueEmail(
        { to: user.email, subject: mail.subject },
        mail.template,
        mail.data,
        'high'
    ).then(() => ({
        method: 'email',
        sentTo: maskEmail(user.email),
        resendAfter: DELIVERED_CODE_RESEND_SECONDS,
        // Non-null: `armDeliveredCode` just set it, and it is the one thing this promise
        // is built to report back.
        expiresAt: entry.codeExpiresAt!.toISOString()
    }));
};

/**
 * A code mailed to the account's verified address.
 *
 * Deliberately gated on `verified`: 2FA by email is only ever as strong as the mailbox behind it,
 * and an address nobody has proved control of is not a second factor at all. The destination is
 * read from the live record rather than frozen at enrollment — changing it is itself a
 * fresh-auth, re-verified action, so there is no second copy to keep in step.
 */
export const emailMethod: TwoFactorMethodHandler = {
    name: 'email',
    delivers: true,

    // The same condition every other account email already depends on. A deployment with no SMTP
    // host cannot send the code, so it must not offer the method; the demo profile routes mail to
    // its own outbox and can.
    available: () => isDemoMode() || Boolean(process.env.NODE_SMTP_HOST),

    eligibility: (user) =>
        user.verified
            ? { enrollable: true }
            : { enrollable: false, reason: t('account.two-factor.email-unverified') },

    target: (user) => maskEmail(user.email),

    setup: (user, entry, context) =>
        deliver(user, entry, context).then((delivery) => ({
            method: delivery.method,
            delivers: true,
            sentTo: delivery.sentTo,
            resendAfter: delivery.resendAfter,
            expiresAt: delivery.expiresAt
        })),

    send: deliver,

    verify: (_user, entry, code) => Promise.resolve(consumeDeliveredCode(entry, code))
};
