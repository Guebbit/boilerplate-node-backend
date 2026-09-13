/**
 * @module
 * Locale service — the override tier: what it can be asked, and the rules that make it safe to ask.
 * A folder rather than one file because it passed ~300 lines (see `docs/theory/layers.md`).
 * Nothing here is ever AWAITED by `t()`, `negotiateLocale` or the locale middleware — the overrides
 * these functions write reach `t()` only through an overlay rebuilt off the request path.
 */

/*
 * No loose re-exports beside the namespace: `localeService` is the only name anything imports from
 * here — controllers, `module.ts` and tests alike — and a second list naming every function said
 * that twice, which is one list too many to keep in step with the folder.
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
    listCapabilities
} from './capabilities';
import { listTenants } from '../tenants';
import { createLanguage, updateLanguage, deleteLanguage } from './languages';
import { searchEntries, createEntry, updateEntry, deleteEntry, importEntries } from './entries';
import { readMessages, readApiOverrides } from './messages';
import { setTranslatables } from './translatables';
import { getEntityTranslations, upsertEntityTranslations } from './translations';

/** The one name anything outside `services/` imports — every function the module exposes. */
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
    importEntries,
    setTranslatables,
    getEntityTranslations,
    upsertEntityTranslations
};
