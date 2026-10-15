/**
 * @module
 * The manifest — which languages this deployment offers, and what each can do. Two tiers answer
 * that: languages deployed as files, and languages registered as rows, merged into one list here
 * without ever implying they are the same capability.
 */

import {
    LocaleDirection,
    LocaleSource,
    type LocaleCapabilities,
    type LocaleCapability
} from '@types';
import { getDefaultLocale, getFallbackLocale, listSupportedLocales } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import type { Caller } from '@types';
import { accessibleFilterFor } from '@kernel/access/query';
import { deriveBaseLanguage, type LocaleDocument } from '../model';
import { localeEntryRepository, localeRepository } from '../repository';
import { backendApp, frontendApp } from '../apps';

/**
 * Base languages written right to left, consulted only for STATIC languages — a registered
 * language states its own direction. A plain list rather than
 * `Intl.Locale.prototype.getTextInfo`, whose availability varies by deployment.
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
 * For STATIC languages only. Falls back to the tag itself on a bad tag or missing ICU data: a
 * manifest reading `es` beats a 500.
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
    // The backend app and only that: the API can answer in it, and there is no dictionary to
    // download.
    apps: [backendApp()],
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
    apps: [frontendApp()],
    source: LocaleSource.dynamic,
    entryCount,
    revision: language.revision
});

/**
 * The two tiers as one list. A tag in both merges into ONE row carrying BOTH apps, using the
 * dynamic side's display fields — the only side that has any. Sorted by tag so the response is
 * stable across diffs.
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
                      apps: [backendApp(), frontendApp()],
                      source: LocaleSource.both
                  }
                : dynamic
        );
    }

    return [...rows.values()].toSorted((left, right) => left.tag.localeCompare(right.tag));
};

/**
 * The dynamic half of the manifest, or nothing. Swallows a database failure on purpose: a Mongo
 * outage must cost only the downloadable-dictionary half of the answer, never the in-memory static
 * half `GET /locales` exists to guarantee. Logged at warn, not silently.
 */
export const readDynamicTier = (
    scope?: Record<string, unknown>
): Promise<{
    languages: LocaleDocument[];
    entryCounts: Map<string, number>;
}> =>
    Promise.all([
        // `active` gates what a VISITOR may select and nothing else — the admin, who is the
        // one toggling the flag, reads every row. Same rule as products and users.
        localeRepository.list(scope),
        localeEntryRepository.countEntriesByLocale()
    ])
        .then(([languages, entryCounts]) => ({ languages, entryCounts }))
        .catch((error: unknown) => {
            // Stryker disable all
            logger.warn('listCapabilities - dynamic locale tier unavailable, serving static only', {
                error
            });
            // Stryker restore all
            return { languages: [], entryCounts: new Map() };
        });

/**
 * Which languages a caller is allowed to read.
 *
 * Every language for a holder of `display:Locale`, the active ones for everyone else. Takes the
 * resolved `Caller`, which a session and an API key both reach, so a key minted with the staff
 * read is answered as that read and not as a stranger. Why the scope rides in the read is the
 * shared rule's to explain — see `accessibleFilterFor`.
 *
 * @param caller - `request.caller`, or `undefined` for an anonymous request
 */
export const callerScope = (caller?: Caller) => accessibleFilterFor(caller, 'Locale');

/**
 * Every language this deployment offers, and what each of them can do.
 *
 * @param scope - which rows this caller may read ({@link callerScope}); inactive languages are
 *   only in reach of the admin surface
 */
export const listCapabilities = (scope?: Record<string, unknown>): Promise<LocaleCapabilities> =>
    readDynamicTier(scope).then(({ languages, entryCounts }) => ({
        locales: mergeCapabilities(listSupportedLocales(), languages, entryCounts),
        default: getDefaultLocale(),
        fallback: getFallbackLocale()
    }));
