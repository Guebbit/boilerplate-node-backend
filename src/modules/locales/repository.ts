/**
 * @module
 * The two collections' queries, and the one invariant that could not be left to a caller: every
 * write to `localeentries` goes through a function below that also bumps `revision`, so no
 * service call can change an entry without moving the number a client uses to know when to
 * re-download. Not a transaction — the two writes are ordered rows-then-counter, so a crash
 * between them only makes a client under-fetch once, never cache a stale dictionary as current.
 */

import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import {
    localeModel,
    localeEntryModel,
    translationModel,
    applyLocaleTransform,
    applyLocaleEntryTransform,
    applyTranslationTransform
} from './model';
import type { LocaleDocument, LocaleEntryDocument, TranslationDocument } from './model';
import { createRepository, type Repository } from '@infrastructure/persistence/create-repository';
import type { LocaleTenant, TranslationFields, TranslationOrigin } from '@types';
import { frontendTenantIds } from './tenants';

/** One key and its translation, as a write supplies them. */
export interface EntryInput {
    key: string;
    value: string;
}

/** What a bulk import did. */
export interface ImportCounts {
    created: number;
    updated: number;
    removed: number;
}

/** Base CRUD/search repository over the languages collection. */
const localeBase = createRepository<LocaleDocument>(localeModel, {
    transform: applyLocaleTransform,
    searchable: {
        exact: { tag: 'tag' },
        booleans: { active: 'active' }
    }
});

/** Base CRUD/search repository over the entries collection. */
const entryBase = createRepository<LocaleEntryDocument>(localeEntryModel, {
    transform: applyLocaleEntryTransform,
    searchable: {
        /*
         * One filter, and it searches both columns. A translator looking for "Catálogo" and a
         * developer looking for `products.list` are the same search box, and splitting them into
         * `key=` and `value=` would only make the caller guess which one they are doing.
         */
        text: ['key', 'value'],
        // Which tenant to list. Absent means every tenant, which is what an admin screen opens on.
        exact: { tenant: 'tenant' }
    }
});

/** One language by its tag — the lookup every route in this module starts with. */
const findByTag = (tag: string): Promise<LocaleDocument | null> =>
    localeBase.findOne({ tag: tag.toLowerCase() });

/** Which languages a visitor may select. Narrows the manifest read; admins pass no scope. */
const publicScope = (): Record<string, unknown> => ({ active: true });

/**
 * The languages this deployment offers, unpaginated and sorted by tag.
 *
 * Unpaginated on purpose: a deployment's languages are a handful of rows by construction, and
 * `findAll`'s default limit of ten would silently truncate a manifest that grew past it.
 *
 * @param scope - the caller's filter fragment, or `undefined` to read every row
 */
const list = (scope?: Record<string, unknown>): Promise<LocaleDocument[]> =>
    localeModel
        .find({ ...scope })
        .sort({ tag: 1 })
        .lean<LocaleDocument[]>()
        .exec();

/**
 * How many DOWNLOADABLE entries each language has, in one query rather than one per language.
 *
 * Frontend tenants' rows only: this feeds the manifest's `entryCount`, and counting the API's own
 * overrides would advertise a language as having strings a client cannot actually download.
 */
const countEntriesByLocale = async (): Promise<Map<string, number>> => {
    const rows = await localeEntryModel
        .aggregate<{
            _id: string;
            count: number;
        }>([
            { $match: { tenant: { $in: frontendTenantIds() } } },
            { $group: { _id: '$locale', count: { $sum: 1 } } }
        ])
        .exec();

    return new Map(rows.map(({ _id, count }) => [_id, count]));
};

/**
 * Every row for one language and one tenant, sorted by key so a build is byte-stable.
 *
 * Narrowed here rather than filtered by the caller: tenants share key names, so a build that
 * received every tenant would nest the API's `generic` over a client's and hand a frontend strings
 * it never authored. `(locale, tenant)` is a prefix of the unique index, so this stays one lookup.
 */
const listEntries = (locale: string, tenant: LocaleTenant): Promise<LocaleEntryDocument[]> =>
    localeEntryModel.find({ locale, tenant }).sort({ key: 1 }).lean<LocaleEntryDocument[]>().exec();

/**
 * Every row of one tenant, across every language, for the override overlay.
 *
 * One query rather than one per language: the backend tenant's share of this collection is a
 * handful of rows by construction. Sorted by `(locale, key)` so a rebuilt overlay is
 * byte-identical to the last one when nothing changed.
 */
const listEntriesByTenant = (tenant: LocaleTenant): Promise<LocaleEntryDocument[]> =>
    localeEntryModel
        .find({ tenant })
        .sort({ locale: 1, key: 1 })
        .lean<LocaleEntryDocument[]>()
        .exec();

/**
 * Just the keys of one language.
 *
 * Its own query rather than a `listEntries().map()`: the collision check runs on every single
 * write, and it has no use for the values — which are the whole weight of the collection.
 */
const listKeys = async (locale: string, tenant: LocaleTenant): Promise<string[]> => {
    const rows = await localeEntryModel
        .find({ locale, tenant })
        .select({ key: 1, _id: 0 })
        .lean<{ key: string }[]>()
        .exec();

    return rows.map(({ key }) => key);
};

/**
 * Move a language's revision on, and hand back the new value.
 *
 * `$inc` rather than read-modify-write: two imports finishing at once must produce two bumps, and
 * a read-modify-write would lose one — which is precisely the state that leaves a client believing
 * it is current when it is not.
 */
const bumpRevision = async (tag: string): Promise<number> => {
    const updated = await localeModel
        .findOneAndUpdate({ tag }, { $inc: { revision: 1 } }, { returnDocument: 'after' })
        .exec();

    return updated?.revision ?? 0;
};

/** Insert one entry, and bump. */
const createEntry = async (
    locale: string,
    tenant: LocaleTenant,
    input: EntryInput
): Promise<{ entry: LocaleEntryDocument; revision: number }> => {
    const entry = await entryBase.create({
        locale,
        tenant,
        ...input
    } as Partial<LocaleEntryDocument>);
    return { entry, revision: await bumpRevision(locale) };
};

/** Change one entry's value, and bump. */
const saveEntryValue = async (
    entry: LocaleEntryDocument,
    value: string
): Promise<{ entry: LocaleEntryDocument; revision: number }> => {
    entry.value = value;
    const saved = await entryBase.save(entry);
    return { entry: saved, revision: await bumpRevision(entry.locale) };
};

/** Remove one entry, and bump. */
const removeEntry = async (entry: LocaleEntryDocument): Promise<number> => {
    await entryBase.deleteOne(entry);
    return bumpRevision(entry.locale);
};

/**
 * Write a whole set of entries, and bump once for the batch.
 *
 * `replace` is the only difference between the two bulk routes — a single `deleteMany` of keys the
 * caller did not send. One `bulkWrite` rather than a loop of upserts: five hundred keys is the
 * size an import actually arrives in.
 */
const importEntries = async (
    locale: string,
    tenant: LocaleTenant,
    inputs: EntryInput[],
    { replace }: { replace: boolean }
): Promise<{ counts: ImportCounts; revision: number }> => {
    const existing = new Set(await listKeys(locale, tenant));
    const incoming = new Map(inputs.map(({ key, value }) => [key, value]));

    const removedKeys = replace ? [...existing].filter((key) => !incoming.has(key)) : [];

    if (inputs.length > 0)
        await localeEntryModel.bulkWrite(
            [...incoming].map(([key, value]) => ({
                updateOne: {
                    filter: { locale, tenant, key },
                    update: { $set: { value }, $setOnInsert: { locale, tenant, key } },
                    upsert: true
                }
            }))
        );

    if (removedKeys.length > 0)
        await localeEntryModel.deleteMany({ locale, tenant, key: { $in: removedKeys } }).exec();

    const created = [...incoming.keys()].filter((key) => !existing.has(key)).length;

    return {
        counts: {
            created,
            updated: incoming.size - created,
            removed: removedKeys.length
        },
        revision: await bumpRevision(locale)
    };
};

/** What a language's own delete cascaded into, per collection. */
export interface LocaleCascadeCounts {
    /** Dictionary entries removed. */
    entries: number;
    /** Translation rows removed — every entity's row in this locale, across every `entityType`. */
    translations: number;
}

/**
 * Remove a language and every string translated into it — its dictionary entries AND its
 * translation rows.
 *
 * The cascade this collection has instead of a foreign key: both reference the language by tag,
 * so removing it alone would leave an orphan row set the next language of that tag would silently
 * inherit.
 *
 * Both cascades go FIRST, the language row LAST — interrupted before it, the surviving language
 * keeps stale rows; interrupted after either cascade but before the language row, it is briefly
 * empty, which is the state the caller asked for anyway.
 */
const deleteLocaleCascade = async (locale: LocaleDocument): Promise<LocaleCascadeCounts> => {
    const [{ deletedCount: entries }, { deletedCount: translations }] = await Promise.all([
        localeEntryModel.deleteMany({ locale: locale.tag }).exec(),
        translationModel.deleteMany({ locale: locale.tag }).exec()
    ]);
    await localeBase.deleteOne(locale);
    return { entries, translations };
};

/** Base CRUD repository over the translations collection. No `searchable`: never listed by filter. */
const translationBase = createRepository<TranslationDocument>(translationModel, {
    transform: applyTranslationTransform
});

/**
 * Every locale this entity has a row for, sorted by locale so a response is byte-stable.
 */
const findEntityTranslations = (
    entityType: string,
    entityId: string
): Promise<TranslationDocument[]> =>
    translationModel
        .find({ entityType, entityId })
        .sort({ locale: 1 })
        .lean<TranslationDocument[]>()
        .exec();

/** One entity's row in one locale, or `null` when it has none yet. */
const findEntityLocale = (
    entityType: string,
    entityId: string,
    locale: string
): Promise<TranslationDocument | null> =>
    translationModel.findOne({ entityType, entityId, locale }).exec();

/**
 * A page's translated fields, one indexed `$in` query resolving every entity at once — the query
 * `@infrastructure/i18n`'s translation port resolves reads through, and the primitive a future
 * read-path decorator batches a whole page against.
 *
 * `localeCandidates` is `[exact, base, fallback]`, most specific first (see
 * `localeCandidatesFor`); merging walks it in REVERSE so a more specific locale's fields overwrite
 * a less specific one's, field by field — not row by row, since a locale may have translated only
 * some of an entity's fields.
 */
const resolveEntityFields = async (
    entityType: string,
    entityIds: string[],
    localeCandidates: string[]
): Promise<Map<string, TranslationFields>> => {
    const rows = await translationModel
        .find({ entityType, entityId: { $in: entityIds }, locale: { $in: localeCandidates } })
        .select({ entityId: 1, locale: 1, fields: 1, _id: 0 })
        .lean<Pick<TranslationDocument, 'entityId' | 'locale' | 'fields'>[]>()
        .exec();

    const byEntity = new Map<string, Map<string, TranslationFields>>();
    for (const row of rows) {
        const byLocale = byEntity.get(row.entityId) ?? new Map<string, TranslationFields>();
        byLocale.set(row.locale, row.fields);
        byEntity.set(row.entityId, byLocale);
    }

    const leastSpecificFirst = localeCandidates.toReversed();

    const resolved = new Map<string, TranslationFields>();
    for (const [entityId, byLocale] of byEntity) {
        const merged: TranslationFields = {};
        for (const locale of leastSpecificFirst) {
            const fields = byLocale.get(locale);
            if (fields) Object.assign(merged, fields);
        }
        resolved.set(entityId, merged);
    }

    return resolved;
};

/**
 * A stable digest of a fields map, for {@link TranslationDocument.sourceDigest}.
 *
 * Keys are sorted before hashing: `fields` is written and read as a plain object with no
 * guaranteed key order, and two writes of the same content in a different order must produce the
 * same digest — otherwise every fallback-locale save would mark every translation stale.
 */
export const deriveSourceDigest = (fields: TranslationFields): string =>
    createHash('sha256')
        .update(JSON.stringify(fields, Object.keys(fields).toSorted()))
        .digest('hex');

/**
 * Write one entity's one-locale row — created if it had none, replaced if it did.
 *
 * `sourceDigest` is the caller's job to compute (see {@link deriveSourceDigest}): the repository
 * has no opinion on what "the source" means, that is `services/translations.ts`'s reading of the
 * fallback locale.
 */
const upsertEntityLocale = (
    entityType: string,
    entityId: string,
    locale: string,
    fields: TranslationFields,
    origin: TranslationOrigin,
    translatedBy: string | undefined,
    sourceDigest: string | undefined
): Promise<TranslationDocument> =>
    translationModel
        .findOneAndUpdate(
            { entityType, entityId, locale },
            {
                $set: { fields, origin, translatedBy, sourceDigest },
                $setOnInsert: { entityType, entityId, locale }
            },
            { upsert: true, returnDocument: 'after' }
        )
        .exec();

/** Delete one entity's one-locale row — a `null` in a PATCH. A no-op if it never existed. */
const removeEntityLocale = async (
    entityType: string,
    entityId: string,
    locale: string
): Promise<void> => {
    await translationModel.deleteOne({ entityType, entityId, locale }).exec();
};

/**
 * Delete every locale's row for one entity — a product's HARD delete taking its translations with
 * it, in the same operation. Backs the `@infrastructure/i18n` translation port's `removeAll`.
 *
 * @returns how many rows were removed
 */
const removeEntityTranslations = async (entityType: string, entityId: string): Promise<number> => {
    const { deletedCount } = await translationModel.deleteMany({ entityType, entityId }).exec();
    return deletedCount;
};

/**
 * The Mongoose model registered for a `translatables` target's collection, found by name rather
 * than imported — `locales` cannot import `src/modules/products` any more than
 * `@infrastructure/i18n`'s translation port can. Undefined only if the registry names a collection
 * no module has actually registered a model for, which `translatable-targets.test.ts` refuses.
 */
const modelForCollection = (collection: string) =>
    mongoose
        .modelNames()
        .map((name) => mongoose.model(name))
        .find((registeredModel) => registeredModel.collection.name === collection);

/**
 * Copy the fallback-locale row's fields onto the entity's own document — the derived index column
 * a translated product's `title`/`description` become. Only the given keys are set, so a
 * fallback-locale row that only names `title` cannot blank out a `description` written earlier by
 * a different path (there is none today, but the write stays narrow on purpose).
 */
const updateDerivedColumn = (
    collection: string,
    entityId: string,
    fields: TranslationFields
): Promise<unknown> => {
    const targetModel = modelForCollection(collection);
    if (!targetModel) return Promise.resolve(undefined);

    return targetModel.updateOne({ _id: entityId }, { $set: fields }).exec();
};

/*
 * Both contracts are written out rather than inferred. Mongoose's `Query` generics are large
 * enough that TypeScript refuses to serialize the inferred shape at an export boundary (TS7056)
 * once a base repository is spread into an object — the same reason `Repository` itself is a
 * named interface. Naming them doubles as the one place to read what each collection can do.
 */

/** The languages. */
export const localeRepository: Repository<LocaleDocument> & {
    findByTag: (tag: string) => Promise<LocaleDocument | null>;
    publicScope: () => Record<string, unknown>;
    list: (scope?: Record<string, unknown>) => Promise<LocaleDocument[]>;
    bumpRevision: (tag: string) => Promise<number>;
    deleteLocaleCascade: (locale: LocaleDocument) => Promise<LocaleCascadeCounts>;
} = {
    ...localeBase,
    findByTag,
    publicScope,
    list,
    bumpRevision,
    deleteLocaleCascade
};

/** The words. */
export const localeEntryRepository: Repository<LocaleEntryDocument> & {
    countEntriesByLocale: () => Promise<Map<string, number>>;
    listEntries: (locale: string, tenant: LocaleTenant) => Promise<LocaleEntryDocument[]>;
    listEntriesByTenant: (tenant: LocaleTenant) => Promise<LocaleEntryDocument[]>;
    listKeys: (locale: string, tenant: LocaleTenant) => Promise<string[]>;
    createEntry: (
        locale: string,
        tenant: LocaleTenant,
        input: EntryInput
    ) => Promise<{ entry: LocaleEntryDocument; revision: number }>;
    saveEntryValue: (
        entry: LocaleEntryDocument,
        value: string
    ) => Promise<{ entry: LocaleEntryDocument; revision: number }>;
    removeEntry: (entry: LocaleEntryDocument) => Promise<number>;
    importEntries: (
        locale: string,
        tenant: LocaleTenant,
        inputs: EntryInput[],
        options: { replace: boolean }
    ) => Promise<{ counts: ImportCounts; revision: number }>;
} = {
    ...entryBase,
    countEntriesByLocale,
    listEntries,
    listEntriesByTenant,
    listKeys,
    createEntry,
    saveEntryValue,
    removeEntry,
    importEntries
};

/** User-authored content, one row per (entityType, entityId, locale). */
export const translationRepository: Repository<TranslationDocument> & {
    findEntityTranslations: (
        entityType: string,
        entityId: string
    ) => Promise<TranslationDocument[]>;
    findEntityLocale: (
        entityType: string,
        entityId: string,
        locale: string
    ) => Promise<TranslationDocument | null>;
    resolveEntityFields: (
        entityType: string,
        entityIds: string[],
        localeCandidates: string[]
    ) => Promise<Map<string, TranslationFields>>;
    upsertEntityLocale: (
        entityType: string,
        entityId: string,
        locale: string,
        fields: TranslationFields,
        origin: TranslationOrigin,
        translatedBy: string | undefined,
        sourceDigest: string | undefined
    ) => Promise<TranslationDocument>;
    removeEntityLocale: (entityType: string, entityId: string, locale: string) => Promise<void>;
    removeEntityTranslations: (entityType: string, entityId: string) => Promise<number>;
    updateDerivedColumn: (
        collection: string,
        entityId: string,
        fields: TranslationFields
    ) => Promise<unknown>;
} = {
    ...translationBase,
    findEntityTranslations,
    findEntityLocale,
    resolveEntityFields,
    upsertEntityLocale,
    removeEntityLocale,
    removeEntityTranslations,
    updateDerivedColumn
};
