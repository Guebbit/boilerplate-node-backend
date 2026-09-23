/**
 * @module
 * The copy of every email this module sends, resolved into finished strings. Templates only
 * interpolate, never translate — an email renders later in `adapters/email.worker.ts` with no
 * request or locale store to resolve against, so language is an explicit argument: each builder
 * binds its own `t` to the recipient's locale and returns the whole `EmailContent` — template,
 * subject and render context together.
 */

import { enqueueEmail, type EmailContent } from '@infrastructure/adapters/mailer';
import type { JobPriority } from '@infrastructure/adapters/queue';
import { getDefaultLocale, translator } from '@infrastructure/i18n';
import { frontendLink, type TokenLinkKind } from '@infrastructure/http/frontend-link';
import type { CallerContext } from '@types';

/**
 * The shape every token-bearing link email shares: a greeting, an intro, one link, an ignore-me
 * line and the shared footer. `templateSuffix` names both the render template
 * (`account.<templateSuffix>`) and the translation key prefix (`account.email.<templateSuffix>.`)
 * — the two always agree, so a builder can't point at one email's template while borrowing
 * another's copy.
 * @param templateSuffix - shared by the template name and every translation key this email uses
 * @param kind - which {@link frontendLink} path the link resolves to
 */
const linkEmail = (
    templateSuffix: string,
    kind: TokenLinkKind,
    locale: string,
    name: string,
    token: string
): EmailContent => {
    const t = translator(locale);
    return {
        template: `account.${templateSuffix}`,
        subject: t(`account.email.${templateSuffix}.subject`),
        data: {
            locale,
            pageMetaTitle: t(`account.email.${templateSuffix}.meta-title`),
            pageMetaLinks: [],
            greeting: t(`account.email.${templateSuffix}.greeting`, { name }),
            intro: t(`account.email.${templateSuffix}.intro`),
            linkLabel: t(`account.email.${templateSuffix}.link-label`),
            linkUrl: frontendLink(kind, { locale, token }),
            ignore: t(`account.email.${templateSuffix}.ignore`),
            footer: t('email.footer')
        }
    };
};

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
): EmailContent => linkEmail('verify-request', kind, locale, name, token);

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
export const resetRequestEmail = (locale: string, name: string, token: string): EmailContent =>
    linkEmail('reset-request', 'reset', locale, name, token);

/**
 * Account setup: an admin created this account with no password, and asked to have the user set
 * one themselves. Same link, same token type and TTL as {@link resetRequestEmail} — see
 * `authentication.ts`'s `requestAccountSetup` — only the copy differs: the recipient did not lose a
 * password, they never had one.
 */
export const setupRequestEmail = (locale: string, name: string, token: string): EmailContent =>
    linkEmail('setup-request', 'reset', locale, name, token);

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
export const deleteRequestEmail = (locale: string, name: string, token: string): EmailContent =>
    linkEmail('delete-request', 'delete', locale, name, token);

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

/**
 * Queue one of this module's own mails. Defaults to `'high'`: all but two of this module's sends
 * are a token-bearing link or a code someone is actively waiting on — the two confirmations that
 * are not (`resetConfirmEmail`, `deleteConfirmEmail`) pass `'normal'` explicitly at their call site.
 * @param to - the recipient address
 * @param mail - the finished template + subject + data, from one of this file's builders
 * @param priority - see `enqueueEmail`'s own doc for what the two levels mean
 */
export const sendAccountMail = (
    to: string,
    mail: EmailContent,
    priority: JobPriority = 'high'
): Promise<void> => enqueueEmail({ to, subject: mail.subject }, mail.template, mail.data, priority);
