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
import { accountFrontendLink, type AccountLinkKind } from './config';
import type { CallerContext } from '@types';
import { normalizeEmail } from '@infrastructure/persistence/normalize-email';

/**
 * The greeting line of an account mail: the name, or a plain "Hello!" when there is none to print.
 *
 * One place for every template that greets by name, so an empty name is handled once. A name is
 * user-supplied text; {@link greetableName} decides when it may appear.
 *
 * @param t - the translator bound to the recipient's locale
 * @param key - the template's own `...greeting` key (takes a `name`)
 * @param name - the display name, or `''` for none
 */
const greetingFor = (t: ReturnType<typeof translator>, key: string, name: string): string =>
    name === '' ? t('account.email.greeting-anonymous') : t(key, { name });

/**
 * The name an account mail may print for the mailbox it goes to: the account's own `username`
 * ONLY when the mail goes to that account's VERIFIED address, otherwise `''`.
 *
 * `username` is a free display name. A mail to an address nobody has proven — a signup for a
 * stranger's address, a pending new address — would put attacker-chosen text in a stranger's inbox,
 * from the shop's own domain. One rule at the send site, so no template has to remember it.
 *
 * @param user - the account the mail concerns
 * @param address - the address the mail is going to
 * @returns the name to pass to a builder, or `''`
 */
export const greetableName = (
    user: { username: string; email: string; verifiedAt?: Date | null },
    address: string
): string =>
    user.verifiedAt && normalizeEmail(address) === normalizeEmail(user.email) ? user.username : '';

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
    kind: Extract<AccountLinkKind, 'verify' | 'email-change'> = 'verify'
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'account.verify-request',
        subject: t('account.email.verify-request.subject'),
        data: {
            locale,
            pageMetaTitle: t('account.email.verify-request.meta-title'),
            pageMetaLinks: [],
            greeting: greetingFor(t, 'account.email.verify-request.greeting', name),
            intro: t('account.email.verify-request.intro'),
            linkLabel: t('account.email.verify-request.link-label'),
            linkUrl: accountFrontendLink(kind, { locale, token }),
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
            greeting: greetingFor(t, 'account.email.email-change-notice.greeting', name),
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
            greeting: greetingFor(t, 'account.email.reset-request.greeting', name),
            intro: t('account.email.reset-request.intro'),
            linkLabel: t('account.email.reset-request.link-label'),
            linkUrl: accountFrontendLink('reset', { locale, token }),
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
            greeting: greetingFor(t, 'account.email.setup-request.greeting', name),
            intro: t('account.email.setup-request.intro'),
            linkLabel: t('account.email.setup-request.link-label'),
            linkUrl: accountFrontendLink('reset', { locale, token }),
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
            greeting: greetingFor(t, 'account.email.two-factor-code.greeting', name),
            intro: t('account.email.two-factor-code.intro'),
            code,
            expiry: t('account.email.two-factor-code.expiry', { minutes }),
            ignore: t('account.email.two-factor-code.ignore'),
            footer: t('email.footer')
        }
    };
};

/**
 * Step-up code mail: the code an account with no password types to prove it is still the one
 * signed in. Its own template name (the outbox name is an identifier, one per mail) with the
 * second-factor code's layout, and copy that never claims the reader is "signing in".
 *
 * @param code - the delivered code, in the clear; the account stores only its HMAC
 * @param minutes - how long the code lasts, so the copy and the server never disagree
 */
export const reauthCodeEmail = (
    locale: string,
    name: string,
    code: string,
    minutes: number
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'account.reauth-code',
        subject: t('account.email.reauth-code.subject'),
        data: {
            locale,
            pageMetaTitle: t('account.email.reauth-code.meta-title'),
            pageMetaLinks: [],
            greeting: greetingFor(t, 'account.email.reauth-code.greeting', name),
            intro: t('account.email.reauth-code.intro'),
            code,
            expiry: t('account.email.reauth-code.expiry', { minutes }),
            ignore: t('account.email.reauth-code.ignore'),
            footer: t('email.footer')
        }
    };
};

/** What happened to the account's second factors, for {@link twoFactorChangedEmail}. */
export type TwoFactorChange = 'enrolled' | 'removed' | 'disabled';

/**
 * Two-factor change notice: sent out of band the moment a factor is added or replaced, removed, or
 * 2FA is turned off. A change made from a stolen session is otherwise silent — the owner's only
 * warning is this mail (OWASP MFA Cheat Sheet, "Changing MFA Factors"). Carries no link that acts.
 *
 * @param change - `'enrolled'` covers an added and a replaced factor alike
 * @param method - the wire name of the factor concerned; ignored for `'disabled'`
 */
export const twoFactorChangedEmail = (
    locale: string,
    name: string,
    change: TwoFactorChange,
    method = ''
): EmailContent => {
    const t = translator(locale);
    return {
        template: 'account.two-factor-changed',
        subject: t('account.email.two-factor-changed.subject'),
        data: {
            locale,
            pageMetaTitle: t('account.email.two-factor-changed.meta-title'),
            pageMetaLinks: [],
            greeting: greetingFor(t, 'account.email.two-factor-changed.greeting', name),
            body: t(`account.email.two-factor-changed.body-${change}`, { method }),
            advice: t('account.email.two-factor-changed.advice'),
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
            greeting: greetingFor(t, 'account.email.reset-confirm.greeting', name),
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
            greeting: greetingFor(t, 'account.email.delete-request.greeting', name),
            intro: t('account.email.delete-request.intro'),
            linkLabel: t('account.email.delete-request.link-label'),
            linkUrl: accountFrontendLink('delete', { locale, token }),
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
            greeting: greetingFor(t, 'account.email.delete-confirm.greeting', name),
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
            greeting: greetingFor(t, 'account.email.inactivity-warning.greeting', name),
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
