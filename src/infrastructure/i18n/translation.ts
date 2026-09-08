/**
 * @module
 * The translation port: how a read path resolves user-authored content — a product's title, a
 * category's description — into a caller's language. Registered by `modules/locales` the same way
 * `./overrides` registers its provider, so this file stays free of any `src/modules/*` import and
 * a decorator over `createRepository` can depend on it without a cycle.
 *
 * See: docs/tools/i18n.md
 */

import { getFallbackLocale } from './catalog';

/**
 * One entity's translated field values, keyed by field name — `{ title, description }` for a
 * product. An absent key means untranslated, never an empty string.
 */
export type TranslatedFields = Record<string, string>;

/**
 * Resolves a batch of entities' translated fields in one locale-aware query.
 *
 * `localeCandidates` is the full fallback chain the caller already computed — see
 * {@link localeCandidatesFor} — never a single locale, so an implementation can satisfy a whole
 * page with one indexed query instead of one per candidate. The fields returned for each entity
 * are already merged in that candidate order, most specific field wins.
 *
 * @returns fields per entityId; an id with no row at all is simply absent from the map
 */
export type TranslationResolver = (
    entityType: string,
    entityIds: string[],
    localeCandidates: string[]
) => Promise<Map<string, TranslatedFields>>;

/** The registered resolver, or `undefined` before `modules/locales` has supplied one. */
let translationResolver: TranslationResolver | undefined;

/**
 * Declare where translated fields come from, replacing any previous resolver.
 *
 * Unregistered is a valid state: a unit test that never imports `modules/locales` gets no
 * resolution, which is correct — there is nothing registered to resolve against.
 */
export const registerTranslationResolver = (resolver?: TranslationResolver): void => {
    translationResolver = resolver;
};

/**
 * The read path's entry point. A no-op — an empty map, no query — when nothing is registered or
 * the batch is empty, so a caller never has to branch on whether translation is wired up.
 */
export const resolveTranslations = (
    entityType: string,
    entityIds: string[],
    localeCandidates: string[]
): Promise<Map<string, TranslatedFields>> =>
    !translationResolver || entityIds.length === 0
        ? Promise.resolve(new Map<string, TranslatedFields>())
        : translationResolver(entityType, entityIds, localeCandidates);

/**
 * The locale chain a resolver query walks, most specific first: the exact tag, its base language,
 * then the deployment's fallback — deduplicated, since a base tag requested directly (`it`) must
 * not appear twice. All three are known before any query runs, which is what keeps resolution to
 * one index arm per page rather than a per-entity lookup.
 */
export const localeCandidatesFor = (locale: string): string[] => {
    const base = locale.split('-')[0];
    return [...new Set([locale, base, getFallbackLocale()])].filter((tag) => tag.length > 0);
};
