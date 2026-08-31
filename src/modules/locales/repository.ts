/**
 * @module
 * The two collections' queries, and the one invariant that could not be left to a caller: every
 * write to `localemessages` goes through a function below that also bumps `revision`, so no
 * service call can change an entry without moving the number a client uses to know when to
 * re-download. Not a transaction — the two writes are ordered rows-then-counter, so a crash
 * between them only makes a client under-fetch once, never cache a stale dictionary as current.
 */

import {
    localeModel,
    localeMessageModel,
    applyLocaleTransform,
    applyLocaleMessageTransform
} from './model';
import type { LocaleDocument, LocaleMessageDocument } from './model';
import { createRepository, type Repository } from '@infrastructure/persistence/create-repository';
import type { LocaleTenant } from '@types';
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
const entryBase = createRepository<LocaleMessageDocument>(localeMessageModel, {
    transform: applyLocaleMessageTransform,
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
    const rows = await localeMessageModel
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
const listEntries = (locale: string, tenant: LocaleTenant): Promise<LocaleMessageDocument[]> =>
    localeMessageModel
        .find({ locale, tenant })
        .sort({ key: 1 })
        .lean<LocaleMessageDocument[]>()
        .exec();

/**
 * Every row of one tenant, across every language, for the override overlay.
 *
 * One query rather than one per language: the backend tenant's share of this collection is a
 * handful of rows by construction. Sorted by `(locale, key)` so a rebuilt overlay is
 * byte-identical to the last one when nothing changed.
 */
const listEntriesByTenant = (tenant: LocaleTenant): Promise<LocaleMessageDocument[]> =>
    localeMessageModel
        .find({ tenant })
        .sort({ locale: 1, key: 1 })
        .lean<LocaleMessageDocument[]>()
        .exec();

/**
 * Just the keys of one language.
 *
 * Its own query rather than a `listEntries().map()`: the collision check runs on every single
 * write, and it has no use for the values — which are the whole weight of the collection.
 */
const listKeys = async (locale: string, tenant: LocaleTenant): Promise<string[]> => {
    const rows = await localeMessageModel
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
): Promise<{ entry: LocaleMessageDocument; revision: number }> => {
    const entry = await entryBase.create({
        locale,
        tenant,
        ...input
    } as Partial<LocaleMessageDocument>);
    return { entry, revision: await bumpRevision(locale) };
};

/** Change one entry's value, and bump. */
const saveEntryValue = async (
    entry: LocaleMessageDocument,
    value: string
): Promise<{ entry: LocaleMessageDocument; revision: number }> => {
    entry.value = value;
    const saved = await entryBase.save(entry);
    return { entry: saved, revision: await bumpRevision(entry.locale) };
};

/** Remove one entry, and bump. */
const removeEntry = async (entry: LocaleMessageDocument): Promise<number> => {
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
        await localeMessageModel.bulkWrite(
            [...incoming].map(([key, value]) => ({
                updateOne: {
                    filter: { locale, tenant, key },
                    update: { $set: { value }, $setOnInsert: { locale, tenant, key } },
                    upsert: true
                }
            }))
        );

    if (removedKeys.length > 0)
        await localeMessageModel.deleteMany({ locale, tenant, key: { $in: removedKeys } }).exec();

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

/**
 * Remove a language and every string translated into it.
 *
 * The cascade this collection has instead of a foreign key: entries reference the language by
 * tag, so removing it alone would leave an orphan row set the next language of that tag would
 * silently inherit.
 *
 * Entries go FIRST — interrupted the other way, the surviving language keeps stale rows;
 * interrupted this way, it is briefly empty, which is the state the caller asked for anyway.
 */
const deleteLocaleCascade = async (locale: LocaleDocument): Promise<number> => {
    const { deletedCount } = await localeMessageModel.deleteMany({ locale: locale.tag }).exec();
    await localeBase.deleteOne(locale);
    return deletedCount;
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
    deleteLocaleCascade: (locale: LocaleDocument) => Promise<number>;
} = {
    ...localeBase,
    findByTag,
    publicScope,
    list,
    bumpRevision,
    deleteLocaleCascade
};

/** The words. */
export const localeMessageRepository: Repository<LocaleMessageDocument> & {
    countEntriesByLocale: () => Promise<Map<string, number>>;
    listEntries: (locale: string, tenant: LocaleTenant) => Promise<LocaleMessageDocument[]>;
    listEntriesByTenant: (tenant: LocaleTenant) => Promise<LocaleMessageDocument[]>;
    listKeys: (locale: string, tenant: LocaleTenant) => Promise<string[]>;
    createEntry: (
        locale: string,
        tenant: LocaleTenant,
        input: EntryInput
    ) => Promise<{ entry: LocaleMessageDocument; revision: number }>;
    saveEntryValue: (
        entry: LocaleMessageDocument,
        value: string
    ) => Promise<{ entry: LocaleMessageDocument; revision: number }>;
    removeEntry: (entry: LocaleMessageDocument) => Promise<number>;
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
