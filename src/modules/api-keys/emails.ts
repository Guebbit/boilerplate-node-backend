/**
 * @module
 * The copy of every email this module sends, resolved into finished strings — same rule as
 * `@modules/account/emails`: language is an argument, the output is finished text, a template
 * only interpolates. Two mails: one to the person who just minted a credential, one when their
 * credentials were revoked because the account may be compromised.
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';

/** Why every credential a person minted was revoked at once — an `account.sessions-revoked` reason. */
export type RevocationReason = 'logout-all' | 'password-reset';

/**
 * Sent to the minter the moment a credential is created: a stolen session that mints a key is
 * otherwise silent, and the key outlives the session. Carries no secret and no link that acts.
 *
 * @param locale - the recipient's own locale
 * @param keyName - the caller-chosen label
 * @param credential - the credential's public display id, never the secret
 * @param expires - the expiry, already formatted for the reader
 */
export const apiKeyMintedEmail = (
    locale: string,
    keyName: string,
    credential: string,
    expires: string
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'api-keys.minted',
        subject: t('api-keys.email-minted.subject'),
        data: {
            locale,
            pageMetaTitle: t('api-keys.email-minted.meta-title'),
            pageMetaLinks: [],
            greeting: t('api-keys.email-minted.greeting'),
            body: t('api-keys.email-minted.body', { name: keyName, credential, expires }),
            advice: t('api-keys.email-minted.advice'),
            footer: t('email.footer')
        }
    };
};

/**
 * Sent when the account's credentials were revoked wholesale, listing each so the owner knows what
 * stopped working.
 *
 * @param locale - the recipient's own locale
 * @param reason - which event triggered it
 * @param credentials - one line per revoked credential: label and public display id
 */
export const apiKeysRevokedEmail = (
    locale: string,
    reason: RevocationReason,
    credentials: readonly string[]
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'api-keys.revoked',
        subject: t('api-keys.email-revoked.subject'),
        data: {
            locale,
            pageMetaTitle: t('api-keys.email-revoked.meta-title'),
            pageMetaLinks: [],
            greeting: t('api-keys.email-revoked.greeting'),
            body: t(`api-keys.email-revoked.body-${reason}`),
            list: credentials.join(', '),
            advice: t('api-keys.email-revoked.advice'),
            footer: t('email.footer')
        }
    };
};
