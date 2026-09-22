/**
 * @module
 * Links into the paired frontend, for the mails that carry one: an account confirmation token, or
 * an order's own page. Infrastructure rather than `@modules/account` or `@modules/orders`, because
 * both need it and neither owns the other — see `docs/theory/layers.md` for why a module may
 * depend downward but not sideways.
 *
 * Every kind's path is a template, individually overridable by its own `NODE_FRONTEND_LINK_*`
 * env var (`.env-example`) so a deployment can rename the paired frontend's routes without a code
 * change. The locale segment is never templated — it always comes first, straight from the
 * caller — since every route on the paired frontend lives under `/:locale`.
 */

import { getDefaultLocale, listSupportedLocales } from '@infrastructure/i18n';

/** The four token-bearing account links — one per kind of proof a link can carry. */
export type TokenLinkKind = 'verify' | 'reset' | 'delete' | 'email-change';

/** Every kind {@link frontendLink} can build: the four token kinds, plus an order's own page. */
export type FrontendLinkKind = TokenLinkKind | 'order';

/** Each kind's env var — `.env-example` documents the default it falls back to. */
const LINK_ENV_VAR: Record<FrontendLinkKind, string> = {
    verify: 'NODE_FRONTEND_LINK_VERIFY',
    reset: 'NODE_FRONTEND_LINK_RESET',
    delete: 'NODE_FRONTEND_LINK_DELETE',
    'email-change': 'NODE_FRONTEND_LINK_EMAIL_CHANGE',
    order: 'NODE_FRONTEND_LINK_ORDER'
};

/**
 * Each kind's default template — the paired frontend's own routes
 * (`boilerplate-vue-frontend/src/modules/{account,orders}/routes.ts`). `{token}`/`{id}` are
 * filled in by {@link frontendLink}, never left for the frontend to parse out of the path itself.
 */
const LINK_DEFAULT_TEMPLATE: Record<FrontendLinkKind, string> = {
    verify: 'verify-email/confirm?token={token}',
    reset: 'password-reset/confirm?token={token}',
    delete: 'account-delete/confirm?token={token}',
    'email-change': 'email-change/confirm?token={token}',
    order: 'orders/{id}'
};

/**
 * The paired frontend's own origin. Same fallback as `account/oauth/config.ts`'s
 * `oauthFrontendCallbackBase` — both read `NODE_FRONTEND_URL` lazily, so a test can set it after
 * import, and both fall back to the frontend's own local dev port rather than the backend's.
 */
const frontendOrigin = (): string => process.env.NODE_FRONTEND_URL ?? 'http://localhost:8080';

/**
 * `locale`, or the deployment's default when it names a language this API cannot answer in — a
 * link into an unsupported locale segment is a 404 on the frontend's own router, not a working
 * page in an unexpected language.
 */
const supportedLocale = (locale: string): string =>
    listSupportedLocales().includes(locale) ? locale : getDefaultLocale();

/** Builds a link for one of the four token-bearing kinds — signup, reset, delete, email-change. */
export function frontendLink(
    kind: TokenLinkKind,
    parameters: { locale: string; token: string }
): string;
/** Builds the link to an order's own page. */
export function frontendLink(kind: 'order', parameters: { locale: string; id: string }): string;
/**
 * A link into the paired frontend: its origin, the email's own locale, and the kind's own
 * path template with `{token}` or `{id}` filled in.
 *
 * @param kind - which link — picks both the template and which of `token`/`id` it needs
 * @param parameters - `locale` the email is written in; `token` for the four confirm kinds, `id` for
 *   `order`
 */
export function frontendLink(
    kind: FrontendLinkKind,
    parameters: { locale: string; token?: string; id?: string }
): string {
    const template = process.env[LINK_ENV_VAR[kind]] ?? LINK_DEFAULT_TEMPLATE[kind];
    const path = template
        .replace('{token}', encodeURIComponent(parameters.token ?? ''))
        .replace('{id}', encodeURIComponent(parameters.id ?? ''));

    return `${frontendOrigin()}/${supportedLocale(parameters.locale)}/${path}`;
}
