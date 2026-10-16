/**
 * @module
 * Locale service — the override tier: what it can be asked, and the rules that make it safe to ask.
 * One file per flow (see `docs/theory/layers.md`).
 * Nothing here is ever AWAITED by `t()` or the locale middleware — the overrides these functions
 * write reach `t()` only through an overlay rebuilt off the request path.
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
import { listApps } from '../apps';
import { createLanguage, updateLanguage, removeLanguage } from './languages';
import { searchEntries, createEntry, updateEntry, removeEntry, importEntries } from './entries';
import { readMessages, readApiOverrides } from './messages';
import { setTranslatables } from './translatables';
import {
    getEntityTranslations,
    upsertEntityTranslations,
    replaceEntityTranslations
} from './translations';
import { localeDisplayName } from '../model';

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
    listApps,
    buildMessageTree,
    findUnsafeKeySegment,
    findKeyCollision,
    findBatchCollision,
    findDuplicateKey,
    readMessages,
    readApiOverrides,
    createLanguage,
    updateLanguage,
    removeLanguage,
    searchEntries,
    createEntry,
    updateEntry,
    removeEntry,
    importEntries,
    setTranslatables,
    getEntityTranslations,
    upsertEntityTranslations,
    replaceEntityTranslations,
    // A controller may not reach `../model` directly (the persistence wall), so the two
    // controllers validating a display name ride through the service instead.
    localeDisplayName
};
