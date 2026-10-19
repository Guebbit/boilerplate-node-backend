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
import {
    accountConfig,
    accountExportLink,
    accountFrontendLink,
    type AccountLinkKind
} from './config';
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
 * The frame every account mail shares: the template and the subject, the page title, the greeting
 * and the footer — all keyed off one template name — around whatever the flow itself says.
 *
 * The `template` is passed whole and as a literal, on purpose: the name is an identifier shared
 * with the twin repository, and the cross-cutting sweeps read it from this source text.
 *
 * @param mail - `template`: the outbox name, `account.<flow>`, which also names the
 *   `account.email.<flow>.*` copy keys; `locale`: the recipient's language; `name`: the display
 *   name for the greeting, or `''` (see {@link greetableName}); `body`: the flow's own copy slots,
 *   from the translator bound to `locale`; `security`: a notice about the account's own security,
 *   whose footer names the support address when `NODE_ACCOUNT_SUPPORT_EMAIL` is set
 */
const accountMail = ({
    template,
    locale,
    name,
    body,
    security = false
}: {
    // `readonly`: the cross-cutting sweeps read every line that starts `template:` as a published
    // name, and this is a type, not one.
    readonly template: `account.${string}`;
    locale: string;
    name: string;
    body: (t: ReturnType<typeof translator>) => Record<string, unknown>;
    security?: boolean;
}): EmailContent => {
    const t = translator(locale);
    const copy = `account.email.${template.slice('account.'.length)}`;
    const support = security ? accountConfig().NODE_ACCOUNT_SUPPORT_EMAIL : undefined;
    return {
        template,
        subject: t(`${copy}.subject`),
        data: {
            locale,
            pageMetaTitle: t(`${copy}.meta-title`),
            greeting: greetingFor(t, `${copy}.greeting`, name),
            ...body(t),
            footer: support
                ? t('account.email.footer-support', { email: support })
                : t('email.footer')
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
    kind: Extract<AccountLinkKind, 'verify' | 'email-change'> = 'verify'
): EmailContent => {
    return accountMail({
        template: 'account.verify-request',
        locale,
        name,
        body: (t) => ({
            intro: t('account.email.verify-request.intro'),
            linkLabel: t('account.email.verify-request.link-label'),
            linkUrl: accountFrontendLink(kind, { locale, token }),
            ignore: t('account.email.verify-request.ignore')
        })
    });
};

/**
 * Email-change notice: sent to the OLD address the moment a change is REQUESTED, not when it
 * completes — a warning that arrives before a takeover is a warning, one that arrives after is a
 * receipt. Carries the one-time undo link, valid for 7 days and kept through a password change:
 * the one thing the old mailbox can do about a change it did not ask for
 * (docs/modules/account.md#proving-an-address).
 *
 * @param undoToken - the plaintext `email-change-undo` token, for the link only
 */
export const emailChangeNoticeEmail = (
    locale: string,
    name: string,
    newEmail: string,
    undoToken: string
): EmailContent => {
    return accountMail({
        template: 'account.email-change-notice',
        locale,
        name,
        body: (t) => ({
            body: t('account.email.email-change-notice.body', { newEmail }),
            linkLabel: t('account.email.email-change-notice.link-label'),
            linkUrl: accountFrontendLink('email-undo', { locale, token: undoToken })
        }),
        security: true
    });
};

/** Password reset: the email carrying the one-time link. */
export const resetRequestEmail = (locale: string, name: string, token: string): EmailContent => {
    return accountMail({
        template: 'account.reset-request',
        locale,
        name,
        body: (t) => ({
            intro: t('account.email.reset-request.intro'),
            linkLabel: t('account.email.reset-request.link-label'),
            linkUrl: accountFrontendLink('reset', { locale, token }),
            ignore: t('account.email.reset-request.ignore')
        })
    });
};

/**
 * Account setup: an admin created this account with no password, and asked to have the user set
 * one themselves. Same link, same token type and TTL as {@link resetRequestEmail} — see
 * `password-reset-request.ts`'s `requestAccountSetup` — only the copy differs: the recipient did not lose a
 * password, they never had one.
 */
export const setupRequestEmail = (locale: string, name: string, token: string): EmailContent => {
    return accountMail({
        template: 'account.setup-request',
        locale,
        name,
        body: (t) => ({
            intro: t('account.email.setup-request.intro'),
            linkLabel: t('account.email.setup-request.link-label'),
            linkUrl: accountFrontendLink('reset', { locale, token }),
            ignore: t('account.email.setup-request.ignore')
        })
    });
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
    return accountMail({
        template: 'account.two-factor-code',
        locale,
        name,
        body: (t) => ({
            intro: t('account.email.two-factor-code.intro'),
            code,
            expiry: t('account.email.two-factor-code.expiry', { minutes }),
            ignore: t('account.email.two-factor-code.ignore')
        })
    });
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
    return accountMail({
        template: 'account.reauth-code',
        locale,
        name,
        body: (t) => ({
            intro: t('account.email.reauth-code.intro'),
            code,
            expiry: t('account.email.reauth-code.expiry', { minutes }),
            ignore: t('account.email.reauth-code.ignore')
        })
    });
};

/** What happened to the account's second factors, for {@link twoFactorChangedEmail}. */
export type TwoFactorChange = 'enrolled' | 'removed' | 'disabled' | 'codes-regenerated';

/**
 * Two-factor change notice: sent out of band the moment a factor is added or replaced, removed, or
 * 2FA is turned off, or the backup codes are replaced. A change made from a stolen session is otherwise silent — the owner's only
 * warning is this mail (OWASP MFA Cheat Sheet, "Changing MFA Factors"). Carries no link that acts.
 *
 * @param change - `'enrolled'` covers an added and a replaced factor alike
 * @param method - the wire name of the factor concerned; ignored for `'disabled'` and `'codes-regenerated'`
 */
export const twoFactorChangedEmail = (
    locale: string,
    name: string,
    change: TwoFactorChange,
    method: string
): EmailContent => {
    return accountMail({
        template: 'account.two-factor-changed',
        locale,
        name,
        body: (t) => ({
            body: t(`account.email.two-factor-changed.body-${change}`, { method }),
            advice: t('account.email.two-factor-changed.advice')
        }),
        security: true
    });
};

/** What happened to the account's sign-in providers, for {@link signInMethodChangedEmail}. */
export type SignInMethodChange = 'linked' | 'unlinked';

/**
 * Sign-in method notice: sent out of band when a provider is connected to an existing account or
 * removed from it. A change made from a stolen session is otherwise silent, and NIST SP 800-63C-4
 * §3.8 says the account holder SHALL be told when a federated identifier is added or removed.
 * Carries no link that acts. Not sent for an account made through a provider: nothing was added to
 * an account somebody already had.
 *
 * @param change - connected or removed
 * @param provider - the registry name (`google`, `github`)
 */
export const signInMethodChangedEmail = (
    locale: string,
    name: string,
    change: SignInMethodChange,
    provider: string
): EmailContent => {
    return accountMail({
        template: 'account.sign-in-method-changed',
        locale,
        name,
        body: (t) => ({
            body: t(`account.email.sign-in-method-changed.body-${change}`, { provider }),
            advice: t('account.email.sign-in-method-changed.advice')
        }),
        security: true
    });
};

/**
 * Two-factor lock notice: sent once, when too many wrong codes lock the account's 2FA checks.
 * Someone is guessing codes; the owner is the one person who can tell whether it was them.
 * Carries no link that acts.
 *
 * @param minutes - how long the lock lasts, so the copy and the server never disagree
 */
export const twoFactorLockedEmail = (
    locale: string,
    name: string,
    minutes: number
): EmailContent => {
    return accountMail({
        template: 'account.two-factor-locked',
        locale,
        name,
        body: (t) => ({
            body: t('account.email.two-factor-locked.body', { minutes }),
            advice: t('account.email.two-factor-locked.advice')
        }),
        security: true
    });
};

/**
 * Password reset: the confirmation, after the password actually changed. Names the sign-in
 * providers still connected to the account: a reset changes the password, not what Google or
 * GitHub can still do, and the owner can only act on a connection they were told about.
 *
 * @param providers - registry names of the linked providers; empty says none are connected
 */
export const resetConfirmEmail = (
    locale: string,
    name: string,
    providers: readonly string[] = []
): EmailContent => {
    return accountMail({
        template: 'account.reset-confirm',
        locale,
        name,
        body: (t) => ({
            body: t('account.email.reset-confirm.body'),
            // Always a sentence: "none connected" is as useful to the owner as the list.
            providers:
                providers.length > 0
                    ? t('account.email.reset-confirm.providers', {
                          providers: providers
                              .map(
                                  (provider) => provider.charAt(0).toUpperCase() + provider.slice(1)
                              )
                              .join(', ')
                      })
                    : t('account.email.reset-confirm.providers-none'),
            advice: t('account.email.reset-confirm.advice')
        }),
        security: true
    });
};

/**
 * Password-change notice: sent out of band after a signed-in password change, the one change a
 * stolen session can make with the current password in hand. A reset keeps its own
 * {@link resetConfirmEmail}. Carries no link that acts and no timestamp: the advice points at the
 * sign-in page's own "Forgot password", which signs every device out and revokes API keys
 * (NIST SP 800-63B-4 §4.6, ASVS 5.0 6.3.7).
 */
export const passwordChangedEmail = (locale: string, name: string): EmailContent => {
    return accountMail({
        template: 'account.password-changed',
        locale,
        name,
        body: (t) => ({
            body: t('account.email.password-changed.body'),
            advice: t('account.email.password-changed.advice')
        }),
        security: true
    });
};

/** Account deletion: the email carrying the one-time confirmation link. */
export const deleteRequestEmail = (locale: string, name: string, token: string): EmailContent => {
    return accountMail({
        template: 'account.delete-request',
        locale,
        name,
        body: (t) => ({
            intro: t('account.email.delete-request.intro'),
            linkLabel: t('account.email.delete-request.link-label'),
            linkUrl: accountFrontendLink('delete', { locale, token }),
            ignore: t('account.email.delete-request.ignore')
        })
    });
};

/** Account deletion: the goodbye, sent after the row is gone. */
export const deleteConfirmEmail = (locale: string, name: string): EmailContent => {
    return accountMail({
        template: 'account.delete-confirm',
        locale,
        name,
        body: (t) => ({
            body: t('account.email.delete-confirm.body'),
            farewell: t('account.email.delete-confirm.farewell')
        })
    });
};

/**
 * Inactivity, stage one: `reap:inactive-accounts` warning that the
 * account will be deactivated, then erased, unless the owner signs back in.
 */
export const inactivityWarningEmail = (
    locale: string,
    name: string,
    graceDays: number
): EmailContent => {
    return accountMail({
        template: 'account.inactivity-warning',
        locale,
        name,
        body: (t) => ({
            body: t('account.email.inactivity-warning.body', { days: graceDays })
        })
    });
};

/**
 * Data export failed: the notice that the build did not finish, so nobody waits for a link that
 * will never come. No link and no data: the way forward is to ask again from the profile.
 *
 * @param locale - the recipient's language
 * @param name - the display name, or `''` (see {@link greetableName})
 */
export const exportFailedEmail = (locale: string, name: string): EmailContent => {
    return accountMail({
        template: 'account.export-failed',
        locale,
        name,
        body: (t) => ({
            body: t('account.email.export-failed.body'),
            ignore: t('account.email.export-failed.ignore')
        })
    });
};

/**
 * Data export ready: the mail carrying the LINK to the file, never the data. The link opens a
 * page that needs a signed-in session, so a forwarded mail hands nobody the file.
 *
 * @param locale - the recipient's language
 * @param name - the display name, or `''` (see {@link greetableName})
 * @param exportId - the export the link downloads
 * @param days - how long the file is kept, for the "works until" sentence
 */
export const exportReadyEmail = (
    locale: string,
    name: string,
    exportId: string,
    days: number
): EmailContent => {
    return accountMail({
        template: 'account.export-ready',
        locale,
        name,
        body: (t) => ({
            intro: t('account.email.export-ready.intro'),
            linkLabel: t('account.email.export-ready.link-label'),
            linkUrl: accountExportLink(locale, exportId),
            expiry: t('account.email.export-ready.expiry', { days }),
            ignore: t('account.email.export-ready.ignore')
        })
    });
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
