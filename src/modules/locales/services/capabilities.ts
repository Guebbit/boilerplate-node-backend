/**
 * @module
 * The manifest — which languages this deployment offers, and what each can do. Two tiers answer
 * that: languages deployed as files, and languages registered as rows, merged into one list here
 * without ever implying they are the same capability.
 */

import { LocaleDirection, LocaleSource, type Language, type LocaleCapabilities } from '@types';
import { getDefaultLocale, getFallbackLocale, listSupportedLocales } from '@infrastructure/i18n';
import {
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { logger } from '@infrastructure/adapters/logger';
import type { Caller } from '@types';
import { accessibleFilterFor } from '@kernel/access/query';
import { deriveBaseLanguage, type LocaleDocument } from '../model';
import { localeEntryRepository, localeRepository } from '../repository';
import { languageNotFound } from './languages';
import { backendApp, frontendApp } from '../apps';
import {
    NO_ACTIONS,
    NO_STANDING,
    languageActions,
    standingOnRead,
    type LanguageStanding
} from './actions';

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

/**
 * How the manifest describes a language that exists only as deployed files.
 *
 * @param tag - the language
 * @param active - whether it is switched on. A deployed file has no off switch of its own: it is
 *   selectable unless a row registered for the same tag switches it off. A visitor still gets that
 *   row, as `active: false`, so a client that bundles the language itself knows to stop offering it.
 */
export const staticCapability = (tag: string, active = true): Language => ({
    tag,
    baseLanguage: deriveBaseLanguage(tag),
    name: describeLanguage(tag, 'en'),
    nativeName: describeLanguage(tag, tag),
    direction: isRightToLeft(tag) ? LocaleDirection.rtl : LocaleDirection.ltr,
    active,
    // The backend app and only that: the API has its own wording in it, and there is no dictionary
    // to download.
    apps: [backendApp()],
    source: LocaleSource.static,
    entryCount: 0,
    revision: 0,
    // No registered row to switch, edit or delete.
    actions: NO_ACTIONS
});

/**
 * How the manifest describes a language that exists as rows. The row's own `id` and timestamps
 * ride along when it has them; a static language has no row, so none is invented.
 */
export const dynamicCapability = (
    language: Pick<
        LocaleDocument,
        'tag' | 'name' | 'nativeName' | 'direction' | 'active' | 'revision'
    > &
        Partial<Pick<LocaleDocument, '_id' | 'createdAt' | 'updatedAt'>>,
    entryCount: number,
    standing: LanguageStanding = NO_STANDING
): Language => ({
    // Read off `_id`: the manifest's rows come straight from `.lean()`, before the `id` transform.
    ...(language._id ? { id: String(language._id) } : {}),
    tag: language.tag,
    baseLanguage: deriveBaseLanguage(language.tag),
    name: language.name,
    nativeName: language.nativeName,
    direction: language.direction,
    active: language.active,
    apps: [frontendApp()],
    source: LocaleSource.dynamic,
    entryCount,
    revision: language.revision,
    actions: languageActions(language, standing),
    ...(language.createdAt ? { createdAt: language.createdAt.toISOString() } : {}),
    ...(language.updatedAt ? { updatedAt: language.updatedAt.toISOString() } : {})
});

/**
 * The two tiers as one list. A tag in both merges into ONE row carrying BOTH apps, using the
 * dynamic side's display fields — the only side that has any. Sorted by tag so the response is
 * stable across diffs.
 */
export const mergeCapabilities = (
    staticTags: readonly string[],
    dynamicLanguages: readonly LocaleDocument[],
    entryCounts: ReadonlyMap<string, number>,
    inactiveTags: ReadonlySet<string> = new Set(),
    standing: LanguageStanding = NO_STANDING
): Language[] => {
    const rows = new Map<string, Language>();

    for (const tag of staticTags) rows.set(tag, staticCapability(tag, !inactiveTags.has(tag)));

    for (const language of dynamicLanguages) {
        const dynamic = dynamicCapability(language, entryCounts.get(language.tag) ?? 0, standing);
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
    inactiveTags: ReadonlySet<string>;
}> =>
    Promise.all([
        // `active` gates what a VISITOR may select and nothing else — the admin, who is the
        // one toggling the flag, reads every row. Same rule as products and users.
        localeRepository.list(scope),
        localeEntryRepository.countEntriesByLocale(),
        localeRepository.listInactiveTags()
    ])
        .then(([languages, entryCounts, inactive]) => ({
            languages,
            entryCounts,
            inactiveTags: new Set(inactive)
        }))
        .catch((error: unknown) => {
            // Stryker disable all
            logger.warn('listCapabilities - dynamic locale tier unavailable, serving static only', {
                error
            });
            // Stryker restore all
            return { languages: [], entryCounts: new Map(), inactiveTags: new Set<string>() };
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
 * The standing a manifest read may carry for this caller — none unless they are answered outside
 * the cache every guest shares.
 *
 * @param caller - `request.caller`, or `undefined` for an anonymous request
 */
export const readStanding = (caller?: Caller): LanguageStanding =>
    standingOnRead(callerScope, caller);

/**
 * Every language this deployment offers, and what each of them can do.
 *
 * @param scope - which rows this caller may read ({@link callerScope}); inactive languages are
 *   only in reach of the admin surface
 * @param standing - what the caller may do to a registered language ({@link readStanding})
 */
export const listCapabilities = (
    scope?: Record<string, unknown>,
    standing: LanguageStanding = NO_STANDING
): Promise<LocaleCapabilities> =>
    readDynamicTier(scope).then(({ languages, entryCounts, inactiveTags }) => ({
        // A language with a deployed dictionary file is always in `listSupportedLocales()`; a
        // visitor's scoped read drops its switched-off row, so the flags come from the unscoped
        // set. It stays in the list as `active: false` rather than vanishing: the frontend bundles
        // its own copy of the language, and only this row tells it to stop offering it. A failed
        // read of the flags is an empty set, and the files are served as before.
        locales: mergeCapabilities(
            listSupportedLocales(),
            languages,
            entryCounts,
            inactiveTags,
            standing
        ),
        default: getDefaultLocale(),
        fallback: getFallbackLocale()
    }));

/**
 * One language as the manifest would list it, or a 404 when the caller cannot see it.
 *
 * Reads through {@link listCapabilities} on purpose: `GET /locales/{locale}`, the writes' answers
 * and the list are then the same representation under the same scoping, by construction.
 *
 * @param tag - the language
 * @param scope - which rows this caller may read ({@link callerScope}); omit to read every row,
 *   as a write's answer does
 * @param standing - what the caller may do to a registered language ({@link readStanding})
 */
export const readLanguage = (
    tag: string,
    scope?: Record<string, unknown>,
    standing: LanguageStanding = NO_STANDING
): Promise<ResponseSuccess<Language> | ResponseReject> =>
    listCapabilities(scope, standing).then(({ locales }) => {
        const language = locales.find((candidate) => candidate.tag === tag);

        return language ? generateSuccess(language) : languageNotFound();
    });

/**
 * A registered language as the manifest would list it, for the answer to a write on its row.
 *
 * @param document - the row just written
 * @param standing - what the caller may do to a registered language ({@link standingOn})
 */
export const describeStoredLanguage = (
    document: LocaleDocument,
    standing: LanguageStanding
): Promise<Language> =>
    localeEntryRepository.countEntriesByLocale().then((entryCounts) => {
        const [row] = mergeCapabilities(
            listSupportedLocales().filter((tag) => tag === document.tag),
            [document],
            entryCounts,
            new Set(),
            standing
        );
        // `document` is in the merge, so a row for its tag always comes back.
        return row;
    });
