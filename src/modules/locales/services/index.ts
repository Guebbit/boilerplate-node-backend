/**
 * Locale service — the override tier: what it can be asked, and the rules that make it safe to ask.
 *
 * A folder rather than one file because it passed ~300 lines; see `docs/theory/layers.md`.
 *
 * | file              | what is in it                                                        |
 * | ----------------- | -------------------------------------------------------------------- |
 * | `keys.ts`         | the rules a translation key must pass to be stored and rendered (internal) |
 * | `capabilities.ts` | which languages and tenants this deployment offers, both tiers merged |
 * | `languages.ts`    | registering, editing and removing a language                          |
 * | `entries.ts`      | one language's rows: the editing page, the writes and the bulk import |
 * | `messages.ts`     | the two reads that hand out stored copy                               |
 *
 * Everything here reads or writes the database, and nothing here is ever AWAITED by `t()`,
 * `negotiateLocale` or the locale middleware. That is the property the whole module is arranged
 * around, and it survives {@link readApiOverrides}: which languages the API can answer in is still
 * decided by deployed files at boot and cannot be affected by a row, and the overrides those rows
 * carry reach `t()` only through an overlay rebuilt off the request path. A database that cannot be
 * read costs the overrides and nothing else.
 */

/*
 * No loose re-exports beside the namespace: `localeService` is the only name anything imports from
 * here — seven controllers, `module.ts` and three suites — and a second list naming all twenty-four
 * functions said that twice, which is one list too many to keep in step with the folder.
 */

import {
    buildMessageTree,
    findUnsafeKeySegment,
    findKeyCollision,
    findBatchCollision,
    findDuplicateKey
} from './keys';
import {
    isRightToLeft,
    describeLanguage,
    staticCapability,
    dynamicCapability,
    mergeCapabilities,
    readDynamicTier,
    callerScope,
    listCapabilities,
    listTenants
} from './capabilities';
import { createLanguage, updateLanguage, deleteLanguage } from './languages';
import { searchEntries, createEntry, updateEntry, deleteEntry, importEntries } from './entries';
import { readMessages, readApiOverrides } from './messages';

export const localeService = {
    isRightToLeft,
    describeLanguage,
    staticCapability,
    dynamicCapability,
    mergeCapabilities,
    readDynamicTier,
    callerScope,
    listCapabilities,
    listTenants,
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
