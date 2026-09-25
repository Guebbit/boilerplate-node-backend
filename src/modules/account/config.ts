/**
 * @module
 * `account`'s own links into the paired frontend — the four token-bearing kinds a confirmation
 * email can carry (verify, reset, delete, email-change), each with its own default template and
 * `NODE_FRONTEND_LINK_*` override. `infrastructure/http/frontend-link.ts` only turns a resolved
 * template into a URL; it does not know these kinds exist, or that `account` does — see
 * `docs/theory/layers.md` for why infrastructure may not know a module by name (D14).
 */

import { frontendLink } from '@infrastructure/http/frontend-link';

/** The four token-bearing account links — one per kind of proof a link can carry. */
export type AccountLinkKind = 'verify' | 'reset' | 'delete' | 'email-change';

/** Each kind's env var — `.env-example` documents the default it falls back to. */
const LINK_ENV_VAR: Record<AccountLinkKind, string> = {
    verify: 'NODE_FRONTEND_LINK_VERIFY',
    reset: 'NODE_FRONTEND_LINK_RESET',
    delete: 'NODE_FRONTEND_LINK_DELETE',
    'email-change': 'NODE_FRONTEND_LINK_EMAIL_CHANGE'
};

/**
 * Each kind's default template — the paired frontend's own routes
 * (`<paired-frontend>/src/modules/account/routes.ts`). `{token}` is filled in by
 * {@link frontendLink}, never left for the frontend to parse out of the path itself.
 */
const LINK_DEFAULT_TEMPLATE: Record<AccountLinkKind, string> = {
    verify: 'verify-email/confirm?token={token}',
    reset: 'password-reset/confirm?token={token}',
    delete: 'account-delete/confirm?token={token}',
    'email-change': 'email-change/confirm?token={token}'
};

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
    frontendLink(
        process.env[LINK_ENV_VAR[kind]] ?? LINK_DEFAULT_TEMPLATE[kind],
        parameters.locale,
        {
            token: parameters.token
        }
    );
