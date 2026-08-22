import {
    localeModel,
    localeMessageModel,
    applyLocaleTransform,
    applyLocaleMessageTransform
} from './model';
import type { LocaleDocument, LocaleMessageDocument } from './model';
import {
    createBaseRepository,
    type BaseRepository
} from '@infrastructure/persistence/base-repository';
import type { LocaleTenant } from '@types';
import { frontendTenantIds } from './tenants';

/**
 * The two collections' queries, and the one invariant that could not be left to a caller.
 *
 * ## Why the revision bump lives here
 *
 * `revision` is how a client decides whether to re-download a dictionary: it stores the number it
 * downloaded and re-fetches when the manifest reports a higher one. A bump that a service has to
 * remember is a bump some future service forgets, and the failure is silent — every client keeps
 * serving yesterday's translation, and nothing in this repo would notice.
 *
 * So every write to `localemessages` goes through a function below that also bumps, and none of
 * them is separable from its bump. The service layer cannot change an entry without moving the
 * number because there is no call that does one without the other.
 *
 * Not a transaction, and it does not need to be: the two writes are ordered rows-then-counter, so
 * a crash between them leaves entries that are newer than the revision claims. A client under-
 * fetches for one revision — it re-reads on the next write — which is the harmless direction. The
 * reverse ordering would have clients caching a dictionary they believed current and never
 * correcting it.
 */

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

const localeBase = createBaseRepository<LocaleDocument>(localeModel, {
    transform: applyLocaleTransform,
    searchable: {
        exact: { tag: 'tag' },
        booleans: { active: 'active' }
    }
});

const entryBase = createBaseRepository<LocaleMessageDocument>(localeMessageModel, {
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
 * Unpaginated on purpose, and safe to be: this is the set a deployment offers, which is a handful
 * of rows by construction — a deployment with a thousand languages has a different problem.
 * `findAll` is not used because its default limit is ten, and a manifest silently truncated at ten
 * languages is the kind of bug that only appears on the deployment that grew.
 *
 * The scope is the caller's, spread into the same query rather than picked between two methods —
 * the pair mirrors the products repository, where `publicScope` narrows and admins pass nothing.
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
 * Frontend tenants' rows only, because this number is the manifest's `entryCount` and the manifest
 * is read by clients deciding whether a language is worth switching to. Counting the API's own
 * overrides in it would inflate a language that has nothing a client could download — a Spanish
 * with fifty backend overrides and no client strings would advertise as a fifty-key dictionary
 * and arrive empty.
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
 * One query rather than one per language: the overlay is rebuilt whole on every refresh, and the
 * backend tenant's share of this collection is a handful of rows by construction — it holds only
 * the keys somebody has chosen to override, never a dictionary.
 *
 * Sorted by `(locale, key)` so a rebuilt overlay is byte-identical to the last one when nothing
 * changed, which is what makes a diff of two refreshes readable.
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
 * `replace` is the only difference between the two bulk routes, and it is a single `deleteMany` of
 * the keys the caller did not send. Expressed as a flag HERE, where both callers can be read side
 * by side; expressed as two HTTP methods at the edge, where a client cannot ask for one and get the
 * other.
 *
 * One `bulkWrite` rather than a loop of upserts: five hundred keys is the size an import actually
 * arrives in, and five hundred round trips is the difference between a request and a timeout.
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
 * The cascade this collection has instead of a foreign key, and the reason it is one call: the
 * entries reference the language by tag, so a language removed on its own would leave its rows
 * behind as an invisible orphan set that the next language of the same tag would silently inherit.
 *
 * Entries go FIRST. Interrupted the other way round, the surviving language keeps rows it can
 * still serve; interrupted this way, the language is briefly empty, which is the state the caller
 * asked for anyway.
 */
const deleteLocaleCascade = async (locale: LocaleDocument): Promise<number> => {
    const { deletedCount } = await localeMessageModel.deleteMany({ locale: locale.tag }).exec();
    await localeBase.deleteOne(locale);
    return deletedCount;
};

/*
 * Both contracts are written out rather than inferred. Mongoose's `Query` generics are large
 * enough that TypeScript refuses to serialize the inferred shape at an export boundary (TS7056)
 * once a base repository is spread into an object — the same reason `BaseRepository` itself is a
 * named interface. Naming them doubles as the one place to read what each collection can do.
 */

/** The languages. */
export const localeRepository: BaseRepository<LocaleDocument> & {
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
export const localeMessageRepository: BaseRepository<LocaleMessageDocument> & {
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
