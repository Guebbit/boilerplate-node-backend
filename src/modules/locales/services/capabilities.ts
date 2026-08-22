/**
 * The manifest — which languages this deployment offers, and what each of them can do.
 *
 * Two tiers answer that question: languages deployed as files, and languages registered as rows.
 * This file is where they become one list without ever implying they are the same capability.
 */

import {
    LocaleDirection,
    LocaleSource,
    type LocaleCapabilities,
    type LocaleCapability
} from '@types';
import { getDefaultLocale, getFallbackLocale, listSupportedLocales } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import { createVisibilityScope } from '@kernel/authorization';
import { deriveBaseLanguage, type LocaleDocument } from '../model';
import { localeMessageRepository, localeRepository } from '../repository';
import { backendTenant, frontendTenant } from '../tenants';

/**
 * Base languages written right to left.
 *
 * A list rather than `Intl.Locale.prototype.getTextInfo`, which is recent enough that its
 * availability would be a deployment question rather than a code one — and this answer has to be
 * the same on every worker. It is consulted only for STATIC languages, which have no row to state
 * their own direction; a language registered through the admin routes says which way it runs.
 */
const RIGHT_TO_LEFT_BASE_LANGUAGES = new Set([
    'ar',
    'arc',
    'ckb',
    'dv',
    'fa',
    'he',
    'ks',
    'ku',
    'ps',
    'sd',
    'ug',
    'ur',
    'yi'
]);

/** Whether a tag runs right to left, judged on its base language (`ar-EG` → `ar`). */
export const isRightToLeft = (tag: string): boolean =>
    RIGHT_TO_LEFT_BASE_LANGUAGES.has(deriveBaseLanguage(tag));

/**
 * A language's name in some language — `('es', 'en')` is `Spanish`, `('es', 'es')` is `Español`.
 *
 * For STATIC languages only, which are a directory listing and carry no display names of their
 * own. Falling back to the tag itself is deliberate: a manifest row reading `es` is worse than one
 * reading `Spanish` and far better than a 500, and an ICU build without the data is a deployment
 * fact this code cannot fix.
 */
export const describeLanguage = (tag: string, inLanguage: string): string => {
    // eslint-disable-next-line no-restricted-syntax -- Intl.DisplayNames throws on malformed tags; the tag itself is the only sane fallback
    try {
        return new Intl.DisplayNames([inLanguage], { type: 'language' }).of(tag) ?? tag;
    } catch {
        return tag;
    }
};

/** How the manifest describes a language that exists only as deployed files. */
export const staticCapability = (tag: string): LocaleCapability => ({
    tag,
    name: describeLanguage(tag, 'en'),
    nativeName: describeLanguage(tag, tag),
    direction: isRightToLeft(tag) ? LocaleDirection.rtl : LocaleDirection.ltr,
    // A deployed file has no off switch: a static language is always selectable.
    active: true,
    // The backend tenant and only that: the API can answer in it, and there is no dictionary to
    // download.
    tenants: [backendTenant()],
    source: LocaleSource.static,
    entryCount: 0,
    revision: 0
});

/** How the manifest describes a language that exists as rows. */
export const dynamicCapability = (
    language: Pick<
        LocaleDocument,
        'tag' | 'name' | 'nativeName' | 'direction' | 'active' | 'revision'
    >,
    entryCount: number
): LocaleCapability => ({
    tag: language.tag,
    name: language.name,
    nativeName: language.nativeName,
    direction: language.direction,
    active: language.active,
    tenants: [frontendTenant()],
    source: LocaleSource.dynamic,
    entryCount,
    revision: language.revision
});

/**
 * The two tiers as one list, without ever implying they are the same capability.
 *
 * A tag in both merges into ONE row carrying BOTH tenants. The dynamic side supplies the display
 * fields because it is the only side that has any — a static language's name is derived from its
 * tag — so there is nothing for the two to disagree about.
 *
 * Ordered by tag, so the response is stable and a client diffing two manifests sees only real
 * changes.
 */
export const mergeCapabilities = (
    staticTags: readonly string[],
    dynamicLanguages: readonly LocaleDocument[],
    entryCounts: ReadonlyMap<string, number>
): LocaleCapability[] => {
    const rows = new Map<string, LocaleCapability>();

    for (const tag of staticTags) rows.set(tag, staticCapability(tag));

    for (const language of dynamicLanguages) {
        const dynamic = dynamicCapability(language, entryCounts.get(language.tag) ?? 0);
        rows.set(
            language.tag,
            rows.has(language.tag)
                ? {
                      ...dynamic,
                      tenants: [backendTenant(), frontendTenant()],
                      source: LocaleSource.both
                  }
                : dynamic
        );
    }

    return [...rows.values()].toSorted((left, right) => left.tag.localeCompare(right.tag));
};

/**
 * The dynamic half of the manifest, or nothing.
 *
 * The one place in this module that swallows a database failure, and the reason is the promise the
 * whole tier split exists to keep: `GET /locales` is what a client asks when everything else has
 * already failed it. A Mongo outage must cost the DYNAMIC half of the answer — which languages
 * offer a downloadable dictionary — and never the static half, which is held in memory and is the
 * part that says which languages the API can actually answer in.
 *
 * Logged at warn rather than silently: a manifest quietly missing its dynamic languages looks
 * exactly like a deployment that has none.
 */
export const readDynamicTier = async (
    scope?: Record<string, unknown>
): Promise<{
    languages: LocaleDocument[];
    entryCounts: Map<string, number>;
}> => {
    // eslint-disable-next-line no-restricted-syntax -- a dead database serves the static tier, not a 500 — the catch is that degradation
    try {
        const [languages, entryCounts] = await Promise.all([
            // `active` gates what a VISITOR may select and nothing else — the admin, who is the
            // one toggling the flag, reads every row. Same rule as products and users.
            localeRepository.list(scope),
            localeMessageRepository.countEntriesByLocale()
        ]);
        return { languages, entryCounts };
    } catch (error) {
        logger.warn('listCapabilities - dynamic locale tier unavailable, serving static only', {
            detail: error instanceof Error ? error.message : String(error)
        });
        return { languages: [], entryCounts: new Map() };
    }
};

/**
 * Which languages a caller is allowed to read.
 *
 * `undefined` for admins, meaning "no restriction"; the active languages for everyone else. Why
 * the scope rides in the read is the shared rule's to explain — see `createVisibilityScope`.
 */
export const callerScope = createVisibilityScope(localeRepository.publicScope);

/**
 * Every language this deployment offers, and what each of them can do.
 *
 * @param scope - which rows this caller may read ({@link callerScope}); inactive languages are
 *   only in reach of the admin surface
 */
export const listCapabilities = async (
    scope?: Record<string, unknown>
): Promise<LocaleCapabilities> => {
    const { languages, entryCounts } = await readDynamicTier(scope);

    return {
        locales: mergeCapabilities(listSupportedLocales(), languages, entryCounts),
        default: getDefaultLocale(),
        fallback: getFallbackLocale()
    };
};
