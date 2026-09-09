/**
 * @module
 * The translation port: how a read path resolves user-authored content — a product's title, a
 * category's description — into a caller's language, and how a HARD delete of that content takes
 * its translation rows with it. Registered by `modules/locales` the same way `./overrides`
 * registers its provider, so this file stays free of any `src/modules/*` import and a decorator
 * over `createRepository` can depend on it without a cycle.
 *
 * `removeAll` is the only removal shape here: a `null` in a PATCH and a language's own delete
 * cascade are both driven from inside `modules/locales` itself, against its own repository — this
 * port exists only for the direction nothing else can reach, a product's hard delete asking its
 * translations to go with it.
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
 * What `modules/locales` supplies once, at import time.
 */
export interface TranslationPort {
    /**
     * Resolves a batch of entities' translated fields in one locale-aware query.
     *
     * `localeCandidates` is the full fallback chain the caller already computed — see
     * {@link localeCandidatesFor} — never a single locale, so an implementation can satisfy a
     * whole page with one indexed query instead of one per candidate. The fields returned for
     * each entity are already merged in that candidate order, most specific field wins.
     *
     * @returns fields per entityId; an id with no row at all is simply absent from the map
     */
    resolve: (
        entityType: string,
        entityIds: string[],
        localeCandidates: string[]
    ) => Promise<Map<string, TranslatedFields>>;

    /**
     * Removes every locale's row for one entity — a product's HARD delete taking its translations
     * with it, in the same operation. Never called for a soft delete: that flip is a restore
     * candidate, and a restored product with no translated name is the bug this port exists to
     * prevent.
     *
     * @returns how many rows were removed
     */
    removeAll: (entityType: string, entityId: string) => Promise<number>;
}

/** The registered port, or `undefined` before `modules/locales` has supplied one. */
let translationPort: TranslationPort | undefined;

/**
 * Declare where translated fields come from and go to, replacing any previous port.
 *
 * Unregistered is a valid state: a unit test that never imports `modules/locales` gets no
 * resolution and no removal, which is correct — there is nothing registered to ask.
 */
export const registerTranslationPort = (port?: TranslationPort): void => {
    translationPort = port;
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
    !translationPort || entityIds.length === 0
        ? Promise.resolve(new Map<string, TranslatedFields>())
        : translationPort.resolve(entityType, entityIds, localeCandidates);

/**
 * The hard-delete path's entry point. A no-op — zero removed, no query — when nothing is
 * registered, for the same reason {@link resolveTranslations} is.
 */
export const removeTranslations = (entityType: string, entityId: string): Promise<number> =>
    translationPort ? translationPort.removeAll(entityType, entityId) : Promise.resolve(0);

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
