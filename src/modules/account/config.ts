/**
 * @module
 * `account`'s own links into the paired frontend — the four token-bearing kinds a confirmation
 * email can carry (verify, reset, delete, email-change), each with its own default template and
 * `NODE_FRONTEND_LINK_*` override. `infrastructure/http/frontend-link.ts` only turns a resolved
 * template into a URL; it does not know these kinds exist, or that `account` does — see
 * `docs/theory/layers.md` for why infrastructure may not know a module by name.
 */

import { defineConfig } from '@infrastructure/config/define';
import { int, text } from '@infrastructure/config/fields';
import { frontendLink } from '@infrastructure/http/frontend-link';

/** The four token-bearing account links — one per kind of proof a link can carry. */
export type AccountLinkKind = 'verify' | 'reset' | 'delete' | 'email-change';

/**
 * The frontend link templates, the two mail-link lifetimes and how long a data export is kept.
 *
 * Each template defaults to the paired frontend's own route
 * (`<paired-frontend>/src/modules/account/routes.ts`). `{token}` is filled in by
 * {@link frontendLink}, never left for the frontend to parse out of the path itself.
 */
export const accountConfig = defineConfig({
    name: 'account',
    shape: {
        NODE_FRONTEND_LINK_VERIFY: text({
            default: 'verify-email/confirm?token={token}',
            describe: 'Template of the email-verification link.'
        }),
        NODE_FRONTEND_LINK_RESET: text({
            default: 'password-reset/confirm?token={token}',
            describe: 'Template of the password-reset link.'
        }),
        NODE_FRONTEND_LINK_DELETE: text({
            default: 'account-delete/confirm?token={token}',
            describe: 'Template of the account-deletion link.'
        }),
        NODE_FRONTEND_LINK_EMAIL_CHANGE: text({
            default: 'email-change/confirm?token={token}',
            describe: 'Template of the email-change link.'
        }),
        NODE_FRONTEND_LINK_EXPORT: text({
            default: 'account-export/{id}',
            describe: 'Template of the link in the "your data export is ready" mail.'
        }),
        NODE_PASSWORD_RESET_TTL_MS: int({
            default: 3_600_000,
            min: 1,
            describe: 'How long a reset link works. Shorter is safer.'
        }),
        NODE_INACTIVE_ACCOUNT_DAYS: int({
            default: 0,
            min: 0,
            describe:
                'Days of inactivity before the reaper warns, then deletes, a customer account (never staff or an administrator). 0 disables it.'
        }),
        NODE_EMAIL_VERIFY_TTL_MS: int({
            default: 86_400_000,
            min: 1,
            describe: 'How long a verification link works.'
        }),
        NODE_ACCOUNT_EXPORT_TTL_DAYS: int({
            default: 7,
            min: 1,
            describe:
                'Days a built data export stays downloadable. After that the nightly reaper deletes the file and the account can ask for a new one.'
        })
    }
});

/** Each kind's variable — `.env-example` documents the default it falls back to. */
const LINK_ENV_VAR = {
    verify: 'NODE_FRONTEND_LINK_VERIFY',
    reset: 'NODE_FRONTEND_LINK_RESET',
    delete: 'NODE_FRONTEND_LINK_DELETE',
    'email-change': 'NODE_FRONTEND_LINK_EMAIL_CHANGE'
} as const satisfies Record<AccountLinkKind, string>;

/**
 * A link into the paired frontend for one of the four token-bearing kinds — signup, reset,
 * delete, email-change.
 *
 * @param kind - which link — picks both the env var and the default template
 * @param parameters - `locale` the email is written in; `token` the link must carry
 */
export const accountFrontendLink = (
    kind: AccountLinkKind,
    parameters: { locale: string; token: string }
): string =>
    frontendLink(accountConfig()[LINK_ENV_VAR[kind]], parameters.locale, {
        token: parameters.token
    });

/**
 * The link in the "your data export is ready" mail: the frontend page that downloads it. Not one
 * of {@link AccountLinkKind}: it carries an export's id, not a token, and the page needs a signed-in
 * session anyway (the download route asks for a fresh one).
 *
 * @param locale - the mail's own locale
 * @param exportId - the export the page downloads
 */
export const accountExportLink = (locale: string, exportId: string): string =>
    frontendLink(accountConfig().NODE_FRONTEND_LINK_EXPORT, locale, { id: exportId });

/**
 * How long a built export is kept, in milliseconds. Read at use, so changing it applies to the
 * next export built and to the next reaper run.
 */
export const exportRetentionMs = (): number =>
    accountConfig().NODE_ACCOUNT_EXPORT_TTL_DAYS * 24 * 60 * 60 * 1000;
