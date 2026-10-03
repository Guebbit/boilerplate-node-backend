/**
 * @module
 * The email handler: a delivered method, so setup and login both reduce to "mint a code, mail it,
 * remember its digest". The code's lifetime, cooldown and attempt ceiling live in
 * `../delivered-codes.ts` — shared with every future channel, since none of that is specific to
 * email.
 */

import { mailConfig } from '@infrastructure/adapters/config';
import { t } from '@infrastructure/i18n';
import type { CallerContext } from '@types';
import type { TwoFactorMethodRecord, UserDocument } from '@modules/users';
import type { TwoFactorDelivery } from '@types';
import { twoFactorCodeEmail, recipientLocale } from '../../emails';
import { sendAccountMail } from '../../services/mail';
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
export const maskEmail = (email: string): string => {
    const [local = '', domain = ''] = email.split('@', 2);
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
        recipientLocale(user.locale, context),
        user.username,
        code,
        Math.round(DELIVERED_CODE_TTL_MS / 60_000)
    );

    // High priority: someone is sitting on a login screen waiting for this, not reading a digest.
    return sendAccountMail(user.email, mail).then(() => ({
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
 * Deliberately gated on `verifiedAt`: 2FA by email is only ever as strong as the mailbox behind it,
 * and an address nobody has proved control of is not a second factor at all. The destination is
 * read from the live record rather than frozen at enrollment — changing it is itself a
 * fresh-auth, re-verified action, so there is no second copy to keep in step.
 */
export const emailMethod: TwoFactorMethodHandler = {
    name: 'email',
    delivers: true,

    // The same condition every other account email already depends on. A deployment with no SMTP
    // host and no outbox transport cannot deliver the code anywhere a caller can read it, so it
    // must not offer the method. `NODE_MAIL_TRANSPORT=outbox` is what the demo profile forces on
    // itself (`scenarios/run-server.ts`, SK-08) — this reads the same setting `resolveMailTransport`
    // would, rather than asking whether it is specifically the demo profile asking.
    available: () =>
        mailConfig().NODE_MAIL_TRANSPORT === 'outbox' || Boolean(mailConfig().NODE_SMTP_HOST),

    eligibility: (user) =>
        user.verifiedAt
            ? { enrollable: true }
            : { enrollable: false, reason: t('account.two-factor.email-unverified') },

    target: (user) => maskEmail(user.email),

    // An enrollment code and a login code are the same send: the setup payload is the delivery
    // plus the discriminator a client reads to know which half of `TwoFactorSetup` is populated.
    setup: (user, entry, context) =>
        deliver(user, entry, context).then((delivery) => ({ ...delivery, delivers: true })),

    send: deliver,

    verify: (_user, entry, code) => Promise.resolve(consumeDeliveredCode(entry, code))
};
