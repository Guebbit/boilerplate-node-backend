import {
    LocaleDirection,
    LocaleScope,
    LocaleSource,
    type CreateLocaleEntryRequest,
    type CreateLocaleRequest,
    type LocaleCapabilities,
    type LocaleCapability,
    type LocaleEntryInput,
    type LocaleImportResult,
    type LocaleMessages,
    type UpdateLocaleRequest,
    type UpdateLocaleEntryRequest
} from '@types';
import { getDefaultLocale, getFallbackLocale, listSupportedLocales, t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import type { PaginatedMeta } from '@infrastructure/persistence/search';
import { deriveBaseLanguage } from './model';
import type { LocaleDocument, LocaleMessageDocument } from './model';
import { localeMessageRepository, localeRepository, type EntryInput } from './repository';
import { createVisibilityScope } from '@kernel/authorization';

/**
 * What the override tier can be asked, and the rules that make it safe to ask.
 *
 * Everything here reads or writes the database, and nothing here is ever AWAITED by `t()`,
 * `negotiateLocale` or the locale middleware. That is the property the whole module is arranged
 * around, and it survives {@link readApiOverrides}: which languages the API can answer in is still
 * decided by deployed files at boot and cannot be affected by a row, and the overrides those rows
 * carry reach `t()` only through an overlay rebuilt off the request path. A database that cannot be
 * read costs the overrides and nothing else.
 */

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

/**
 * Key segments that must never reach a tree.
 *
 * `__proto__` assigned onto a plain object mutates its PROTOTYPE rather than creating a property,
 * which is prototype pollution reached through a translation key. {@link buildMessageTree} is built
 * from null-prototype objects so it cannot happen there either, but a key nobody can render is not
 * worth storing — this is the half that answers with a reason instead of silently doing nothing.
 *
 * An empty segment (`a..b`, `a.`) is in the same bucket: it names a node no client could address.
 */
const UNSAFE_KEY_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

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
    // `api` and only `api`: the API can answer in it, and there is no dictionary to download.
    scopes: [LocaleScope.api],
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
    scopes: [LocaleScope.app],
    source: LocaleSource.dynamic,
    entryCount,
    revision: language.revision
});

/**
 * The two tiers as one list, without ever implying they are the same capability.
 *
 * A tag in both merges into ONE row carrying BOTH scopes. The dynamic side supplies the display
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
                      scopes: [LocaleScope.api, LocaleScope.app],
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

/**
 * Flat dotted rows into the nested shape `GET /locales/{locale}` already serves.
 *
 * THROWS on a collision rather than dropping a key, and that is the point. If both `products.list`
 * and `products.list.title` exist, no tree can hold them — one is a string, the other needs to be
 * an object at the same path — and a builder that quietly picked one would make the outcome depend
 * on insertion order. Every write path refuses such a pair (see {@link findKeyCollision}), so
 * reaching this throw means an invariant was broken behind the API's back; answering 500 is the
 * honest report of that, and `tests/unit/service.test.ts` asserts the throw exists.
 *
 * Nodes are null-prototype objects, so a stored `__proto__` segment creates an ordinary property
 * instead of reassigning a prototype. `JSON.stringify` treats them exactly like plain objects.
 */
export const buildMessageTree = (
    entries: readonly Pick<EntryInput, 'key' | 'value'>[]
): Record<string, unknown> => {
    const tree = Object.create(null) as Record<string, unknown>;

    for (const { key, value } of entries) {
        const segments = key.split('.');
        let node = tree;

        for (const [index, segment] of segments.entries()) {
            if (index === segments.length - 1) {
                if (isPlainObject(node[segment]))
                    throw new Error(
                        `locale key "${key}" is both a string and a group; ` +
                            `one of the two must be renamed`
                    );
                node[segment] = value;
                continue;
            }

            if (node[segment] === undefined) node[segment] = Object.create(null) as unknown;
            else if (!isPlainObject(node[segment]))
                throw new Error(
                    `locale key "${key}" needs "${segments.slice(0, index + 1).join('.')}" ` +
                        `to be a group, but it is already a string`
                );

            node = node[segment] as Record<string, unknown>;
        }
    }

    return tree;
};

/** The offending segment of a key no tree could address, or `undefined` when it is fine. */
export const findUnsafeKeySegment = (key: string): string | undefined =>
    key.split('.').find((segment) => segment.length === 0 || UNSAFE_KEY_SEGMENTS.has(segment));

/**
 * A key from `others` that cannot coexist with `key` in one tree, if there is one.
 *
 * "Cannot coexist" is exactly one relation: either is a strict dotted prefix of the other. An
 * identical key is NOT a collision — it is a duplicate, which is a different answer to the caller
 * and a different message.
 */
export const findKeyCollision = (key: string, others: Iterable<string>): string | undefined => {
    for (const other of others) {
        if (other === key) continue;
        if (other.startsWith(`${key}.`) || key.startsWith(`${other}.`)) return other;
    }
    return undefined;
};

/** The first pair of keys within one batch that cannot coexist. */
export const findBatchCollision = (keys: readonly string[]): [string, string] | undefined => {
    const seen = new Set<string>();

    for (const key of keys) {
        const collision = findKeyCollision(key, seen);
        if (collision) return [key, collision];
        seen.add(key);
    }

    return undefined;
};

/** The first key a batch names twice. */
export const findDuplicateKey = (keys: readonly string[]): string | undefined => {
    const seen = new Set<string>();

    for (const key of keys) {
        if (seen.has(key)) return key;
        seen.add(key);
    }

    return undefined;
};

/** Not found, phrased the one way every route in this module phrases it. */
const languageNotFound = (): ResponseReject =>
    generateReject(404, [t('locales.error-language-not-found')]);

/**
 * The OVERRIDES a client downloads for one language — `app` rows, never `api` ones.
 *
 * Not a dictionary: a client merges this over what it bundles, key by key, so a key nobody has
 * edited keeps its bundled text and a language nobody has finished falls back per key. Handing a
 * frontend the API's half instead would give it the backend's keyspace, which it did not author
 * and cannot render.
 *
 * An INACTIVE language answers exactly as an unknown one does. Inactive means invisible to the
 * public, and a 403 or an empty 200 would both leak that the language exists — which is the one
 * thing a draft translation is being kept from doing.
 */
export const readMessages = async (
    tag: string
): Promise<ResponseSuccess<LocaleMessages> | ResponseReject> => {
    const language = await localeRepository.findByTag(tag);
    if (!language?.active) return languageNotFound();

    const entries = await localeMessageRepository.listEntries(language.tag, LocaleScope.app);

    return generateSuccess({
        locale: language.tag,
        revision: language.revision,
        messages: buildMessageTree(entries)
    });
};

/** Register a language in the dynamic tier. */
export const createLanguage = async (
    payload: CreateLocaleRequest
): Promise<ResponseSuccess<LocaleDocument> | ResponseReject> => {
    const tag = payload.tag.trim().toLowerCase();

    // Checked here for the message, and by a unique index for the race — a concurrent creation of
    // the same tag reaches E11000, which the shared interpreter answers 409 for anyway.
    if (await localeRepository.findByTag(tag))
        return generateReject(409, [t('locales.error-language-exists', { tag })]);

    const language = await localeRepository.create({
        tag,
        name: payload.name.trim(),
        nativeName: payload.nativeName.trim(),
        direction: payload.direction ?? LocaleDirection.ltr,
        active: payload.active ?? true
    } as Partial<LocaleDocument>);

    return generateSuccess(language, 201);
};

/**
 * Edit a language's display fields or its visibility.
 *
 * `undefined` means "leave it alone", which is why each field is tested rather than assigned: a
 * blanket assign would turn a request that changed one field into one that cleared the other three.
 */
export const updateLanguage = async (
    tag: string,
    payload: UpdateLocaleRequest
): Promise<ResponseSuccess<LocaleDocument> | ResponseReject> => {
    const language = await localeRepository.findByTag(tag);
    if (!language) return languageNotFound();

    if (payload.name !== undefined) language.name = payload.name.trim();
    if (payload.nativeName !== undefined) language.nativeName = payload.nativeName.trim();
    if (payload.direction !== undefined) language.direction = payload.direction;
    if (payload.active !== undefined) language.active = payload.active;

    return generateSuccess(await localeRepository.save(language));
};

/**
 * Remove a language and everything translated into it.
 *
 * Refuses while the language is still active. The two-step is the whole safeguard: this destroys
 * work that took a person days, and an accidental `DELETE` should cost a toggle rather than the
 * work. Deactivating first is a state an admin has a reason to use anyway, so the guard asks for
 * nothing artificial.
 */
export const deleteLanguage = async (
    tag: string
): Promise<ResponseSuccess<{ removedEntries: number }> | ResponseReject> => {
    const language = await localeRepository.findByTag(tag);
    if (!language) return languageNotFound();

    if (language.active) return generateReject(409, [t('locales.error-language-active')]);

    return generateSuccess({
        removedEntries: await localeRepository.deleteLocaleCascade(language)
    });
};

/** One page of a language's rows, for the editing screen. */
export const searchEntries = async (
    tag: string,
    filters: {
        page?: string | number;
        pageSize?: string | number;
        text?: string;
        scope?: LocaleScope;
    } = {}
): Promise<
    ResponseSuccess<{ items: LocaleMessageDocument[]; meta: PaginatedMeta }> | ResponseReject
> => {
    const language = await localeRepository.findByTag(tag);
    if (!language) return languageNotFound();

    /*
     * Scoped to this language, and sorted by key rather than by the shared `createdAt` default: a
     * translator reads an alphabetical list, and `(locale, key)` is unique, so sorting on it is
     * already the total order that keeps a row off two pages.
     */
    return generateSuccess(
        await localeMessageRepository.search(filters, { locale: language.tag }, { key: 1 })
    );
};

/**
 * The checks every key has to pass before it can be stored, in the order their answers differ.
 *
 * `others` is what the key will have to live alongside once written — for a create that is
 * everything already stored, for a bulk replace it is only the rest of the batch.
 *
 * ## What is NOT checked, and cannot be
 *
 * That the key is one anything actually renders. A row may name a key no dictionary defines, and
 * that is deliberate on both counts:
 *
 *   By DESIGN, because entries add keys as well as override them — a page's copy can be written
 *   entirely in the database, which is the point of letting someone maintain a site without
 *   touching a JSON file.
 *
 *   By NECESSITY for `app` rows, because their keyspace belongs to the frontend and lives in
 *   another repository. This API has never seen `navigation.label-home` and has no way to learn
 *   it. Only a client holding its own dictionaries can say whether a key is one it uses, so if
 *   that warning is ever wanted it belongs in the admin screen, not here.
 *
 * The cost is small and worth naming: a typo — `prodcuts.list.titel` — saves cleanly and then
 * renders nowhere. Nothing is broken and nothing is overwritten; a key simply does nothing, and
 * whoever typed it has to notice. The checks below are the ones where the alternative IS damage:
 * a key no tree can hold, and a key that would collide with one already stored.
 */
const rejectUnusableKey = (key: string, others: Iterable<string>): ResponseReject | undefined => {
    const unsafe = findUnsafeKeySegment(key);
    if (unsafe !== undefined) return generateReject(422, [t('locales.error-key-invalid', { key })]);

    const collision = findKeyCollision(key, others);
    if (collision !== undefined)
        return generateReject(409, [
            t('locales.error-key-collision', { key, existing: collision })
        ]);

    return undefined;
};

/** Add one key to one language. */
export const createEntry = async (
    tag: string,
    payload: CreateLocaleEntryRequest
): Promise<ResponseSuccess<LocaleMessageDocument> | ResponseReject> => {
    const language = await localeRepository.findByTag(tag);
    if (!language) return languageNotFound();

    const key = payload.key.trim();
    /*
     * Both checks below are scoped to the dictionary being written. The same key legitimately
     * exists on both sides — `generic.error-internal` is one string in each — so checking against
     * every row would refuse the second half of a perfectly correct pair, and a collision between
     * `products.list` and `products.list.title` only matters inside the tree they share.
     */
    const existingKeys = await localeMessageRepository.listKeys(language.tag, payload.scope);

    if (existingKeys.includes(key))
        return generateReject(409, [t('locales.error-key-exists', { key })]);

    const unusable = rejectUnusableKey(key, existingKeys);
    if (unusable) return unusable;

    const { entry } = await localeMessageRepository.createEntry(language.tag, payload.scope, {
        key,
        value: payload.value
    });

    return generateSuccess(entry, 201);
};

/**
 * Change one entry's text.
 *
 * The row is looked up by id and then CHECKED against the language in the path, so
 * `PUT /locales/it/entries/<a spanish entry>` is a 404 rather than a silent cross-language edit.
 * Two routes addressing one row is the shape this API uses everywhere; the path segment being
 * decorative is not.
 */
export const updateEntry = async (
    tag: string,
    entryId: string,
    payload: UpdateLocaleEntryRequest
): Promise<ResponseSuccess<LocaleMessageDocument> | ResponseReject> => {
    const entry = await localeMessageRepository.findById(entryId);
    if (entry?.locale !== tag.trim().toLowerCase())
        return generateReject(404, [t('locales.error-entry-not-found')]);

    const { entry: saved } = await localeMessageRepository.saveEntryValue(entry, payload.value);

    return generateSuccess(saved);
};

/** Remove one key from one language. The other languages keep theirs. */
export const deleteEntry = async (
    tag: string,
    entryId: string
): Promise<ResponseSuccess<{ key: string }> | ResponseReject> => {
    const entry = await localeMessageRepository.findById(entryId);
    if (entry?.locale !== tag.trim().toLowerCase())
        return generateReject(404, [t('locales.error-entry-not-found')]);

    const { key } = entry;
    await localeMessageRepository.removeEntry(entry);

    return generateSuccess({ key });
};

/**
 * Bulk import, in either of its two meanings.
 *
 * `replace` deletes what the body did not name; `merge` leaves it alone. The flag is the ONLY
 * difference, which is why they are one function — two implementations of an import are two places
 * for the collision rules to be got right, and the second one is always the one that is not.
 *
 * The whole batch is validated before anything is written. A half-applied import of five hundred
 * keys is worse than a rejected one: the caller cannot tell which half landed, and re-sending is
 * only safe because nothing was.
 */
export const importEntries = async (
    tag: string,
    scope: LocaleScope,
    entries: readonly LocaleEntryInput[],
    mode: 'replace' | 'merge'
): Promise<ResponseSuccess<LocaleImportResult> | ResponseReject> => {
    const language = await localeRepository.findByTag(tag);
    if (!language) return languageNotFound();

    const inputs = entries.map(({ key, value }) => ({ key: key.trim(), value }));
    const keys = inputs.map(({ key }) => key);

    const duplicate = findDuplicateKey(keys);
    if (duplicate !== undefined)
        return generateReject(409, [t('locales.error-key-exists', { key: duplicate })]);

    const unsafe = keys.find((key) => findUnsafeKeySegment(key) !== undefined);
    if (unsafe !== undefined)
        return generateReject(422, [t('locales.error-key-invalid', { key: unsafe })]);

    const batchCollision = findBatchCollision(keys);
    if (batchCollision)
        return generateReject(409, [
            t('locales.error-key-collision', {
                key: batchCollision[0],
                existing: batchCollision[1]
            })
        ]);

    /*
     * What the batch will have to coexist with once it lands. For a replace that is nothing —
     * every stored key it does not name is about to be deleted — and for a merge it is the stored
     * keys the batch leaves standing. Checking the batch against keys it is about to overwrite
     * would refuse imports that are perfectly consistent with themselves.
     */
    const incoming = new Set(keys);
    const stored = await localeMessageRepository.listKeys(language.tag, scope);
    const survivors = mode === 'replace' ? [] : stored.filter((key) => !incoming.has(key));

    for (const key of keys) {
        const unusable = rejectUnusableKey(key, survivors);
        if (unusable) return unusable;
    }

    const { counts, revision } = await localeMessageRepository.importEntries(
        language.tag,
        scope,
        inputs,
        { replace: mode === 'replace' }
    );

    return generateSuccess({ ...counts, revision });
};

/**
 * Every `api` override, grouped by language and expanded into trees.
 *
 * The provider `@infrastructure/i18n` calls to rebuild its overlay — see the "Database overrides"
 * block there for what the overlay guarantees. Nested here rather than there because expanding a
 * dotted key is this module's job: {@link buildMessageTree} is the one place that refuses
 * `__proto__` and reports a key that is both a string and a group.
 *
 * INACTIVE languages are included, and deliberately so. `active` governs what the PUBLIC can see —
 * the manifest and the downloadable dictionary — and an override is neither. Excluding them would
 * mean a language deactivated mid-translation silently reverted the backend copy already approved
 * for it, which is a different decision than "hide this from visitors".
 *
 * A key both a string and a group throws in the builder. That would take the whole refresh down,
 * so it is caught per language: one malformed dictionary costs its own overrides and leaves every
 * other language's applied.
 */
export const readApiOverrides = async (): Promise<Record<string, Record<string, unknown>>> => {
    const rows = await localeMessageRepository.listEntriesByScope(LocaleScope.api);

    const byLocale = new Map<string, { key: string; value: string }[]>();
    for (const { locale, key, value } of rows)
        byLocale.set(locale, [...(byLocale.get(locale) ?? []), { key, value }]);

    const overrides: Record<string, Record<string, unknown>> = {};
    for (const [locale, entries] of byLocale) {
        // eslint-disable-next-line no-restricted-syntax -- caught per locale: one language's malformed keys must not take down the rest
        try {
            overrides[locale] = buildMessageTree(entries);
        } catch (error) {
            logger.warn('readApiOverrides - skipping a language whose keys cannot form a tree', {
                detail: `${locale}: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    return overrides;
};

export const localeService = {
    isRightToLeft,
    describeLanguage,
    staticCapability,
    dynamicCapability,
    mergeCapabilities,
    readDynamicTier,
    callerScope,
    listCapabilities,
    buildMessageTree,
    findUnsafeKeySegment,
    findKeyCollision,
    findBatchCollision,
    findDuplicateKey,
    readMessages,
    readApiOverrides,
    createLanguage,
    updateLanguage,
    deleteLanguage,
    searchEntries,
    createEntry,
    updateEntry,
    deleteEntry,
    importEntries
};
