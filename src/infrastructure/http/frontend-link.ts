/**
 * @module
 * One job: a path template plus parameters becomes a link into the paired frontend, with its
 * origin and the caller's locale. Infrastructure builds URLs; it does not know which LINKS exist —
 * `account` and `orders` each own their own kinds, `NODE_FRONTEND_LINK_*` env vars and default
 * templates (`account/config.ts`, `orders/config.ts`) and call this with the template already
 * resolved. See `docs/understand/layers.md` for why a module may depend downward but not sideways, and
 * why infrastructure may not know a module by name.
 */

import { getFallbackLocale, isServedLocale, localeCandidatesFor } from '@infrastructure/i18n';
import { siteConfig } from '@infrastructure/http/config';
import { loadSharedRules } from '../config/shared-rules/load';
import { frontendLinksSchema } from '../config/shared-rules/frontend-links';

/**
 * Every default link template and the sitemap's static pages, from
 * `shared/rules/frontend-links.yaml`. The paired frontend reads the same file, so a path its
 * router lacks fails there, not in a reader's inbox.
 */
export const FRONTEND_LINK_RULES = loadSharedRules('frontend-links', frontendLinksSchema);

/**
 * The language a mail's link opens in: the one its words are written in. Walks the tag, its base
 * language, then the fallback, and takes the first the shop serves (`it-CH` opens `/it/`).
 * A tag that is unknown or switched off since the recipient saved it ends at the fallback.
 * The frontend routes only served tags, and a redirect from a stray one drops the `#token`
 * fragment of a reset, signup or email-change link, so the segment is always a served tag.
 */
const supportedLocale = (locale: string): string =>
    localeCandidatesFor(locale).find(isServedLocale) ?? getFallbackLocale();

/**
 * A path template with every `{name}` placeholder filled in and URL-encoded: the part of a link
 * that follows the locale. Also what a module stores when it hands another a screen to open
 * (`orders/64b7...`), before any origin or locale is known.
 *
 * @param template - the path, e.g. `orders/{id}`
 * @param parameters - one value per `{name}` placeholder; a name the template lacks is never substituted
 */
export const fillPath = (template: string, parameters: Record<string, string> = {}): string => {
    let path = template;
    for (const [name, value] of Object.entries(parameters))
        // A function replacer, so a `$&` in a value is text, not a replacement pattern.
        path = path.replaceAll(`{${name}}`, () => encodeURIComponent(value));
    return path;
};

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
): string =>
    /**
     * The origin is the paired frontend's own, with the same fallback as `account/oauth/config.ts`'s
     * `oauthFrontendCallbackBase`: read lazily so a test can set it after import, falling back to
     * the frontend's own local dev port rather than the backend's.
     */
    `${siteConfig().NODE_FRONTEND_URL}/${supportedLocale(locale)}/${fillPath(template, parameters)}`;
