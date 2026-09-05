/**
 * @module
 * The copy of every email this module sends, resolved into finished strings. Templates only
 * interpolate, never translate — an email renders later in `adapters/email.worker.ts` with no
 * request or locale store to resolve against, so language is an explicit argument: each builder
 * binds its own `t` to the recipient's locale and returns the whole `EmailContent` — template,
 * subject and render context together.
 */

import type { EmailContent } from '@infrastructure/adapters/mailer';
import { translator } from '@infrastructure/i18n';

/**
 * Absolute URL for a one-time account link.
 *
 * Built here rather than in the template, where it would be assembled from `process.env`
 * mid-markup. A template that only interpolates cannot reach for configuration, which is the
 * property that makes it renderable from a worker with nothing but the payload.
 */
const accountLink = (route: string, token: string): string =>
    `${process.env.NODE_URL ?? ''}account/${route}/${token}`;

/** Email verification: the email carrying the one-time confirmation link. */
export const verifyRequestEmail = (locale: string, name: string, token: string): EmailContent => {
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
            linkUrl: accountLink('verify', token),
            ignore: t('account.email.verify-request.ignore'),
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
            linkUrl: accountLink('reset', token),
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
            linkUrl: accountLink('reset', token),
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
            linkUrl: accountLink('delete', token),
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
 * Inactivity, stage one: `ops/reap-inactive-accounts.ts` warning that the
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
