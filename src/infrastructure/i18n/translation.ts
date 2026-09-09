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

import type { UpsertTranslationsRequest } from '@types';
import type { ResponseReject } from '@infrastructure/http/response';
import { getFallbackLocale } from './catalog';
import { getCurrentLocale } from './context';

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

    /**
     * Every entity whose translated fields match a search pattern, in the caller's locale chain —
     * what a free-text search unions with an entity's own (fallback-language) match, so searching
     * in Italian finds a product whose Italian row is the only place the word appears.
     *
     * `pattern` arrives already escaped — see {@link applyTranslations}'s caller-side sibling,
     * `search()` — so an implementation never touches raw caller input.
     *
     * @returns entity ids, deduplicated
     */
    search: (
        entityType: string,
        fields: readonly string[],
        pattern: string,
        localeCandidates: string[]
    ) => Promise<string[]>;

    /**
     * Validates a PATCH-shaped batch — see `UpsertTranslationsRequest` — against the `locales`
     * collection and the registry's declared fields, WITHOUT writing anything. No entity id: every
     * check is about the locale and the field names, never about a specific row, which is what
     * lets a caller creating a new entity in the SAME request (`productService.write`'s
     * `POST /products`) validate before that entity even exists.
     *
     * @returns the plan {@link write} applies, or the first rejection encountered
     */
    plan: (
        entityType: string,
        payload: UpsertTranslationsRequest
    ) => Promise<TranslationWritePlan | ResponseReject>;

    /**
     * Applies an ALREADY-VALIDATED plan — see {@link plan} — without touching the entity's own
     * derived index column, its cache tag, or an audit trail: a caller with its own document to
     * write owns all three itself, in the same operation that calls this. Never validates; a
     * caller that skips {@link plan} first can corrupt data.
     */
    write: (
        entityType: string,
        entityId: string,
        writePlan: TranslationWritePlan,
        translatedBy: string | undefined
    ) => Promise<void>;
}

/**
 * One locale slot {@link TranslationPort.plan} decided on: upsert with these fields, or delete.
 * Never `origin` — that is the generic translator's-door concept a caller writing its OWN
 * document (an editor's product write) has no use for; {@link TranslationPort.write}'s
 * implementation defaults it.
 */
export type TranslationWriteSlot =
    | { locale: string; kind: 'upsert'; fields: TranslatedFields }
    | { locale: string; kind: 'delete' };

/** A validated batch, ready for {@link TranslationPort.write}. */
export interface TranslationWritePlan {
    fallbackLocale: string;
    planned: TranslationWriteSlot[];
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
 * The search path's entry point. An empty list — never a query — when nothing is registered, for
 * the same reason {@link resolveTranslations} is.
 */
export const searchTranslatedEntityIds = (
    entityType: string,
    fields: readonly string[],
    pattern: string,
    localeCandidates: string[]
): Promise<string[]> =>
    translationPort
        ? translationPort.search(entityType, fields, pattern, localeCandidates)
        : Promise.resolve([]);

/**
 * The validate half of a write, for a caller with its own entity to write alongside the
 * translations — see {@link TranslationPort.plan}.
 *
 * Unregistered is a hard failure rather than a silent no-op, unlike this file's other entry
 * points: a caller reaching this expects to WRITE, and pretending the batch validated when
 * nothing is registered to ask would be the one lie in this module that costs data.
 */
export const planTranslations = (
    entityType: string,
    payload: UpsertTranslationsRequest
): Promise<TranslationWritePlan | ResponseReject> => {
    if (!translationPort)
        return Promise.resolve({
            success: false,
            status: 500,
            message: 'no translation port registered',
            data: undefined,
            errors: [{ code: 'INTERNAL', message: 'no translation port registered' }]
        });
    return translationPort.plan(entityType, payload);
};

/** The write half of a write — see {@link TranslationPort.write}. A no-op when unregistered. */
export const writeTranslations = (
    entityType: string,
    entityId: string,
    writePlan: TranslationWritePlan,
    translatedBy: string | undefined
): Promise<void> =>
    translationPort
        ? translationPort.write(entityType, entityId, writePlan, translatedBy)
        : Promise.resolve();

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

/** The one thing {@link applyTranslations} needs from an already wire-shaped item. */
export interface Translatable {
    id: string;
}

/**
 * Overlays each item's resolved translated fields onto its ALREADY wire-shaped copy — one batched
 * query for the whole page, via {@link resolveTranslations} and {@link localeCandidatesFor} bound
 * to the ambient locale `runWithLocaleContext` carries. No signature threading: the read path
 * that calls this needs no locale parameter of its own.
 *
 * Deliberately NOT for a hydrated Mongoose document: spreading one loses whatever its own
 * `toJSON` transform computes (a virtual like `available`, `_id` → `id`, dates to ISO strings),
 * so a caller with a document calls `.toJSON()` (or reads through `search()`'s already-normalized
 * output) before this ever sees it. Resolution is async and batched, the serializer is
 * synchronous and per-document — the two stay separate, and this one runs strictly after the
 * other.
 *
 * @returns a new array; an item with no translation row is returned unchanged, by reference
 */
export const applyTranslations = async <T extends Translatable>(
    entityType: string,
    items: readonly T[]
): Promise<T[]> => {
    if (items.length === 0) return [...items];

    const candidates = localeCandidatesFor(getCurrentLocale());
    const resolved = await resolveTranslations(
        entityType,
        items.map((item) => item.id),
        candidates
    );

    if (resolved.size === 0) return [...items];

    return items.map((item) => {
        const fields = resolved.get(item.id);
        return fields ? { ...item, ...fields } : item;
    });
};
