/**
 * @module
 * One job: a path template plus parameters becomes a link into the paired frontend, with its
 * origin and the caller's locale. Infrastructure builds URLs; it does not know which LINKS exist —
 * `account` and `orders` each own their own kinds, `NODE_FRONTEND_LINK_*` env vars and default
 * templates (`account/config.ts`, `orders/config.ts`) and call this with the template already
 * resolved. See `docs/theory/layers.md` for why a module may depend downward but not sideways, and
 * why infrastructure may not know a module by name.
 */

import { getDefaultLocale, listSupportedLocales } from '@infrastructure/i18n';
import { siteConfig } from '@infrastructure/http/config';

/**
 * The paired frontend's own origin. Same fallback as `account/oauth/config.ts`'s
 * `oauthFrontendCallbackBase` — both read `NODE_FRONTEND_URL` lazily, so a test can set it after
 * import, and both fall back to the frontend's own local dev port rather than the backend's.
 */
const frontendOrigin = (): string => siteConfig().NODE_FRONTEND_URL;

/**
 * `locale`, or the deployment's default when it names a language this API cannot answer in — a
 * link into an unsupported locale segment is a 404 on the frontend's own router, not a working
 * page in an unexpected language.
 */
const supportedLocale = (locale: string): string =>
    listSupportedLocales().includes(locale) ? locale : getDefaultLocale();

/**
 * A link into the paired frontend: its origin, the email's own locale, and `template` with every
 * `{name}` placeholder filled in and URL-encoded. The locale segment is never part of `template` —
 * it always comes first, straight from `locale` — since every route on the paired frontend lives
 * under `/:locale`.
 *
 * @param template - the path, e.g. `orders/{id}` or `password-reset/confirm#token={token}` — the
 *   caller's own default or its `NODE_FRONTEND_LINK_*` override, already resolved before this runs
 * @param locale - the email's own locale
 * @param parameters - one value per `{name}` placeholder `template` uses; a name `template` does
 *   not use is simply never substituted
 */
export const frontendLink = (
    template: string,
    locale: string,
    parameters: Record<string, string> = {}
): string => {
    let path = template;
    for (const [name, value] of Object.entries(parameters))
        // A function replacer, so a `$&` in a value is text, not a replacement pattern.
        path = path.replaceAll(`{${name}}`, () => encodeURIComponent(value));

    return `${frontendOrigin()}/${supportedLocale(locale)}/${path}`;
};
