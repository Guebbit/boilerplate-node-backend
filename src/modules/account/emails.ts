/**
 * @module
 * The copy of every email this module sends, resolved into finished strings. Templates only
 * interpolate, never translate — an email renders later in `adapters/email.worker.ts` with no
 * request or locale store to resolve against, so language is an explicit argument: each builder
 * binds its own `t` to the recipient's locale and returns the whole `EmailContent` — template,
 * subject and render context together.
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { getDefaultLocale, translator } from '@infrastructure/i18n';
import { frontendLink, type TokenLinkKind } from '@infrastructure/http/frontend-link';
import type { CallerContext } from '@types';

/**
 * Email verification: the email carrying the one-time confirmation link. Shared by both
 * verification tokens (`account/services/verification.ts`) — only `kind` differs, so a
 * signup/re-send link lands on the frontend's verify-email page and an email-change link on its
 * email-change page; the copy makes no claim about which address it is.
 * @param kind - `'verify'` or `'email-change'`, matching the frontend page the token confirms
 */
export const verifyRequestEmail = (
    locale: string,
    name: string,
    token: string,
    kind: Extract<TokenLinkKind, 'verify' | 'email-change'> = 'verify'
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'account.verify-request',
        subject: t('account.email.verify-request.subject'),
        data: {
            locale,
            pageMetaTitle: t('account.email.verify-request.meta-title'),
            pageMetaLinks: [],
            greeting: t('account.email.verify-request.greeting', { name }),
            intro: t('account.email.verify-request.intro'),
            linkLabel: t('account.email.verify-request.link-label'),
            linkUrl: frontendLink(kind, { locale, token }),
            ignore: t('account.email.verify-request.ignore'),
            footer: t('email.footer')
        }
    };
};

/**
 * Email-change notice: sent to the OLD address the moment a change is REQUESTED, not when it
 * completes — a warning that arrives before a takeover is a warning, one that arrives after is a
 * receipt. Carries no token and no link that acts: "this wasn't me" is a password change and a
 * logout-everywhere, both of which already exist (docs/modules/account.md#proving-an-address).
 */
export const emailChangeNoticeEmail = (
    locale: string,
    name: string,
    newEmail: string
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'account.email-change-notice',
        subject: t('account.email.email-change-notice.subject'),
        data: {
            locale,
            pageMetaTitle: t('account.email.email-change-notice.meta-title'),
            pageMetaLinks: [],
            greeting: t('account.email.email-change-notice.greeting', { name }),
            body: t('account.email.email-change-notice.body', { newEmail }),
            footer: t('email.footer')
        }
    };
};

/** Password reset: the email carrying the one-time link. */
export const resetRequestEmail = (locale: string, name: string, token: string): EmailContent => {
    const t = translator(locale);
    return {
        template: 'account.reset-request',
        subject: t('account.email.reset-request.subject'),
        data: {
            locale,
            pageMetaTitle: t('account.email.reset-request.meta-title'),
            pageMetaLinks: [],
            greeting: t('account.email.reset-request.greeting', { name }),
            intro: t('account.email.reset-request.intro'),
            linkLabel: t('account.email.reset-request.link-label'),
            linkUrl: frontendLink('reset', { locale, token }),
            ignore: t('account.email.reset-request.ignore'),
            footer: t('email.footer')
        }
    };
};

/**
 * Account setup: an admin created this account with no password, and asked to have the user set
 * one themselves. Same link, same token type and TTL as {@link resetRequestEmail} — see
 * `authentication.ts`'s `requestAccountSetup` — only the copy differs: the recipient did not lose a
 * password, they never had one.
 */
export const setupRequestEmail = (locale: string, name: string, token: string): EmailContent => {
    const t = translator(locale);
    return {
        template: 'account.setup-request',
        subject: t('account.email.setup-request.subject'),
        data: {
            locale,
            pageMetaTitle: t('account.email.setup-request.meta-title'),
            pageMetaLinks: [],
            greeting: t('account.email.setup-request.greeting', { name }),
            intro: t('account.email.setup-request.intro'),
            linkLabel: t('account.email.setup-request.link-label'),
            linkUrl: frontendLink('reset', { locale, token }),
            ignore: t('account.email.setup-request.ignore'),
            footer: t('email.footer')
        }
    };
};

/**
 * Two-factor login code: the six digits themselves, not a link.
 *
 * No `linkUrl` anywhere in it, deliberately — a mail that both carries a code and offers a button
 * teaches the recipient to click one, which is the exact reflex a phishing page needs. The
 * recipient types the code into the tab they already opened.
 *
 * @param locale - the recipient's own language
 * @param name - the display name for the greeting
 * @param code - the delivered code, in the clear; the account stores only its HMAC
 * @param minutes - how long the code lasts, so the copy and the server never disagree
 */
export const twoFactorCodeEmail = (
    locale: string,
    name: string,
    code: string,
    minutes: number
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'account.two-factor-code',
        subject: t('account.email.two-factor-code.subject'),
        data: {
            locale,
            pageMetaTitle: t('account.email.two-factor-code.meta-title'),
            pageMetaLinks: [],
            greeting: t('account.email.two-factor-code.greeting', { name }),
            intro: t('account.email.two-factor-code.intro'),
            code,
            expiry: t('account.email.two-factor-code.expiry', { minutes }),
            ignore: t('account.email.two-factor-code.ignore'),
            footer: t('email.footer')
        }
    };
};

/** Password reset: the confirmation, after the password actually changed. */
export const resetConfirmEmail = (locale: string, name: string): EmailContent => {
    const t = translator(locale);
    return {
        template: 'account.reset-confirm',
        subject: t('account.email.reset-confirm.subject'),
        data: {
            locale,
            pageMetaTitle: t('account.email.reset-confirm.meta-title'),
            pageMetaLinks: [],
            greeting: t('account.email.reset-confirm.greeting', { name }),
            body: t('account.email.reset-confirm.body'),
            footer: t('email.footer')
        }
    };
};

/** Account deletion: the email carrying the one-time confirmation link. */
export const deleteRequestEmail = (locale: string, name: string, token: string): EmailContent => {
    const t = translator(locale);
    return {
        template: 'account.delete-request',
        subject: t('account.email.delete-request.subject'),
        data: {
            locale,
            pageMetaTitle: t('account.email.delete-request.meta-title'),
            pageMetaLinks: [],
            greeting: t('account.email.delete-request.greeting', { name }),
            intro: t('account.email.delete-request.intro'),
            linkLabel: t('account.email.delete-request.link-label'),
            linkUrl: frontendLink('delete', { locale, token }),
            ignore: t('account.email.delete-request.ignore'),
            footer: t('email.footer')
        }
    };
};

/** Account deletion: the goodbye, sent after the row is gone. */
export const deleteConfirmEmail = (locale: string, name: string): EmailContent => {
    const t = translator(locale);
    return {
        template: 'account.delete-confirm',
        subject: t('account.email.delete-confirm.subject'),
        data: {
            locale,
            pageMetaTitle: t('account.email.delete-confirm.meta-title'),
            pageMetaLinks: [],
            greeting: t('account.email.delete-confirm.greeting', { name }),
            body: t('account.email.delete-confirm.body'),
            farewell: t('account.email.delete-confirm.farewell'),
            footer: t('email.footer')
        }
    };
};

/**
 * Inactivity, stage one: `scripts/ops/reap-inactive-accounts.ts` warning that the
 * account will be deactivated, then erased, unless the owner signs back in.
 */
export const inactivityWarningEmail = (
    locale: string,
    name: string,
    graceDays: number
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'account.inactivity-warning',
        subject: t('account.email.inactivity-warning.subject'),
        data: {
            locale,
            pageMetaTitle: t('account.email.inactivity-warning.meta-title'),
            pageMetaLinks: [],
            greeting: t('account.email.inactivity-warning.greeting', { name }),
            body: t('account.email.inactivity-warning.body', { days: graceDays }),
            footer: t('email.footer')
        }
    };
};

/**
 * The recipient's OWN language, ahead of the request's — an account mail is read later, often on
 * another device, so `Accept-Language` says little about who it is for. `context` is the fallback
 * only when the account itself carries no locale, and is itself optional: a mail sent outside a
 * request (an admin-created account's setup link) has none to fall back to.
 * @param locale - the account's own locale, when it has one
 * @param context - the caller context whose locale is the fallback
 */
export const recipientLocale = (locale: string | undefined, context?: CallerContext): string =>
    locale ?? context?.locale ?? getDefaultLocale();
