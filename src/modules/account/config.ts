/**
 * @module
 * `account`'s own links into the paired frontend — the four token-bearing kinds a confirmation
 * email can carry (verify, reset, restore, email-change), each with its own default template and
 * `NODE_FRONTEND_LINK_*` override. `infrastructure/http/frontend-link.ts` only turns a resolved
 * template into a URL; it does not know these kinds exist, or that `account` does — see
 * `docs/theory/layers.md` for why infrastructure may not know a module by name.
 */

import { defineConfig } from '@infrastructure/config/define';
import { email, int, text } from '@infrastructure/config/fields';
import { frontendLink } from '@infrastructure/http/frontend-link';
import { DAY_MS, oneCalendarMonthLaterUtc } from '@domain-primitives/time';

/** The five token-bearing account links — one per kind of proof a link can carry. */
export type AccountLinkKind = 'verify' | 'reset' | 'restore' | 'email-change' | 'email-undo';

/**
 * The frontend link templates, the two mail-link lifetimes and how long a data export is kept.
 *
 * Each template defaults to the paired frontend's own route
 * (`<paired-frontend>/src/modules/account/routes.ts`). `{token}` is filled in by
 * {@link frontendLink}, never left for the frontend to parse out of the path itself. The token
 * rides in the URL FRAGMENT (`#token=`), which a browser never sends to a server (RFC 3986 §3.5), so
 * it reaches no access log, proxy log or `Referer` header.
 */
export const accountConfig = defineConfig({
    name: 'account',
    shape: {
        NODE_FRONTEND_LINK_VERIFY: text({ default: 'verify-email/confirm#token={token}' }),
        NODE_FRONTEND_LINK_RESET: text({ default: 'password-reset/confirm#token={token}' }),
        NODE_FRONTEND_LINK_RESTORE: text({ default: 'account-restore#token={token}' }),
        NODE_FRONTEND_LINK_EMAIL_CHANGE: text({ default: 'email-change/confirm#token={token}' }),
        NODE_FRONTEND_LINK_EMAIL_UNDO: text({ default: 'email-change/undo#token={token}' }),
        NODE_FRONTEND_LINK_EXPORT: text({ default: 'account-export/{id}' }),
        NODE_PASSWORD_RESET_TTL_MS: int({ default: 3_600_000, min: 1 }),
        NODE_INACTIVE_ACCOUNT_DAYS: int({ default: 0, min: 0 }),
        NODE_INACTIVE_MINIMISE_DAYS: int({ default: 1095, min: 0 }),
        NODE_EMAIL_VERIFY_TTL_MS: int({ default: DAY_MS, min: 1 }),
        NODE_ACCOUNT_EXPORT_TTL_DAYS: int({ default: 7, min: 1 }),
        // Ceiling in code, not in the contract: nothing on the wire is bounded by it. 31 is the
        // longest month; `purgeAt` is also capped at one calendar month (GDPR Art. 12(3)).
        NODE_ACCOUNT_DELETION_GRACE_DAYS: int({ default: 30, min: 1, max: 31 }),
        NODE_TERMS_VERSION: text({ default: '1' }),
        NODE_ACCOUNT_SUPPORT_EMAIL: email()
    }
});

/** Each kind's variable — `.env-example` documents the default it falls back to. */
const LINK_ENV_VAR = {
    verify: 'NODE_FRONTEND_LINK_VERIFY',
    reset: 'NODE_FRONTEND_LINK_RESET',
    restore: 'NODE_FRONTEND_LINK_RESTORE',
    'email-change': 'NODE_FRONTEND_LINK_EMAIL_CHANGE',
    'email-undo': 'NODE_FRONTEND_LINK_EMAIL_UNDO'
} as const satisfies Record<AccountLinkKind, string>;

/**
 * A link into the paired frontend for one of the five token-bearing kinds — signup, reset,
 * restore, email-change, email-undo.
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
 * When an account whose owner asked to delete it at `requestedAt` is erased: the configured grace,
 * but never later than one calendar month after the request. Both bounds, because 30-31 days
 * overruns one month whenever February is in the window (31 Jan + 30 days = 2 Mar), and Art. 12(3)
 * GDPR asks for the erasure within one month.
 *
 * @param requestedAt - when the owner asked
 * @returns the earlier of `requestedAt + grace` and the same date next month at 00:00 UTC
 */
export const deletionPurgeAt = (requestedAt: Date): Date =>
    new Date(
        Math.min(
            requestedAt.getTime() + accountConfig().NODE_ACCOUNT_DELETION_GRACE_DAYS * DAY_MS,
            oneCalendarMonthLaterUtc(requestedAt).getTime()
        )
    );

/**
 * How long a built export is kept, in milliseconds. Read at use, so changing it applies to the
 * next export built and to the next reaper run.
 */
export const exportRetentionMs = (): number =>
    accountConfig().NODE_ACCOUNT_EXPORT_TTL_DAYS * DAY_MS;
