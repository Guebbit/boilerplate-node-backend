/**
 * @module
 * The rows themselves — one language's translated keys, read a page at a time and written one key
 * or one batch at a time. Every write narrows to a single app: a key is unique only within one
 * keyspace, and a collision only matters inside the tree it shares.
 */

import type {
    CreateLocaleEntryRequest,
    LocaleEntry,
    LocaleEntryInput,
    LocaleImportResult,
    LocaleApp,
    UpdateLocaleEntryRequest
} from '@types';
import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import type { PaginatedMeta } from '@infrastructure/persistence/search';
import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { localeAuditActions } from '../audit';
import { normalizeTag, type LocaleEntryDocument } from '../model';
import { localeEntryRepository, localeRepository } from '../repository';
import { findBatchCollision, findDuplicateKey, rejectUnusableKey } from './keys';
import { languageNotFound, rejectUnknownApp } from './languages';
import { refreshOverlay } from './overlay';

/** Not found, phrased the one way {@link findEntryInLanguage} and its two callers all mean it. */
const entryNotFound = (): ResponseReject =>
    generateReject(404, [t('locales.error-entry-not-found')]);

/**
 * The entry named in the path, scoped to the language and the app also named in the path.
 *
 * Looked up by id, then CHECKED against `tag` and `app` — so `PUT /locales/it/apps/x/entries/<a
 * spanish entry>`, or one that belongs to another app, 404s rather than silently cross-editing.
 */
const findEntryInLanguage = (
    entryId: string,
    tag: string,
    app: string
): Promise<LocaleEntryDocument | null> =>
    localeEntryRepository
        .findById(entryId)
        .then((entry) => (entry?.locale === normalizeTag(tag) && entry.app === app ? entry : null));

/**
 * One page of a language's rows, for the editing screen.
 *
 * `app` narrows the page to one app's rows; an app nobody configured is refused with a 422, the
 * same answer the write routes give. Left out, every app's rows are listed.
 */
export const searchEntries = (
    tag: string,
    filters: {
        page?: string | number;
        pageSize?: string | number;
        text?: string;
        app?: LocaleApp;
    } = {}
): Promise<ResponseSuccess<{ items: LocaleEntry[]; meta: PaginatedMeta }> | ResponseReject> =>
    localeRepository.findByTag(tag).then((language) => {
        if (!language) return languageNotFound();

        const unknownApp = filters.app === undefined ? undefined : rejectUnknownApp(filters.app);
        if (unknownApp) return unknownApp;

        /*
         * Scoped to this language, and sorted by key rather than by the shared `createdAt` default:
         * a translator reads an alphabetical list, and `(locale, key)` is unique, so sorting on it
         * is already the total order that keeps a row off two pages.
         */
        return localeEntryRepository
            .search(filters, { locale: language.tag }, { key: 1 })
            .then((result) => generateSuccess(result));
    });

/**
 * Add one key to one language's dictionary in one app.
 * @param app - the app the URI names
 * @param context - caller context for the `ADMIN_LOCALE_ENTRY_CREATED` audit emit; omitted by
 *   tests that call this as a plain helper — no context means no emit
 */
export const createEntry = async (
    tag: string,
    app: string,
    payload: CreateLocaleEntryRequest,
    context?: CallerContext
): Promise<ResponseSuccess<LocaleEntryDocument> | ResponseReject> => {
    const language = await localeRepository.findByTag(tag);
    if (!language) return languageNotFound();

    const unknownApp = rejectUnknownApp(app);
    if (unknownApp) return unknownApp;

    const key = payload.key.trim();
    /*
     * Both checks below are narrowed to the app being written. The same key legitimately
     * exists in two apps — `generic.error-internal` is one string in each — so checking against
     * every row would refuse the second half of a perfectly correct pair, and a collision between
     * `products.list` and `products.list.title` only matters inside the tree they share.
     */
    const existingKeys = await localeEntryRepository.listKeys(language.tag, app);

    if (existingKeys.includes(key))
        return generateReject(409, [t('locales.error-key-exists', { key })]);

    const unusable = rejectUnusableKey(key, existingKeys);
    if (unusable) return unusable;

    const { entry } = await localeEntryRepository.createEntry(language.tag, app, {
        key,
        value: payload.value
    });

    recordAudit(context, {
        action: localeAuditActions.ADMIN_LOCALE_ENTRY_CREATED,
        outcome: 'success',
        target_type: 'locale_entry',
        target_id: String(entry._id),
        metadata: { locale: language.tag, app, key: payload.key }
    });

    refreshOverlay();

    return generateSuccess(entry, 201);
};

/**
 * Change one entry's text.
 * @param app - the app the URI names; the entry must belong to it
 */
export const updateEntry = (
    tag: string,
    app: string,
    entryId: string,
    payload: UpdateLocaleEntryRequest,
    context?: CallerContext
): Promise<ResponseSuccess<LocaleEntryDocument> | ResponseReject> => {
    const unknownApp = rejectUnknownApp(app);
    if (unknownApp) return Promise.resolve(unknownApp);

    return findEntryInLanguage(entryId, tag, app).then((entry) => {
        if (!entry) return entryNotFound();

        return localeEntryRepository
            .saveEntryValue(entry, payload.value)
            .then(({ entry: saved }) => {
                recordAudit(context, {
                    action: localeAuditActions.ADMIN_LOCALE_ENTRY_UPDATED,
                    outcome: 'success',
                    target_type: 'locale_entry',
                    target_id: entryId,
                    // The key, not the new text. An audit trail records that the Spanish product
                    // title changed and who changed it; storing the copy itself would make the trail
                    // a second, unmanaged copy of the dictionary.
                    metadata: { locale: tag, app, key: saved.key }
                });

                refreshOverlay();

                return generateSuccess(saved);
            });
    });
};

/**
 * Remove one key from one language. The other languages keep theirs.
 * @param app - the app the URI names; the entry must belong to it
 * @param context - caller context for the `ADMIN_LOCALE_ENTRY_DELETED` audit emit; omitted by
 *   tests that call this as a plain helper — no context means no emit
 */
export const deleteEntry = (
    tag: string,
    app: string,
    entryId: string,
    context?: CallerContext
): Promise<ResponseSuccess<{ key: string }> | ResponseReject> => {
    const unknownApp = rejectUnknownApp(app);
    if (unknownApp) return Promise.resolve(unknownApp);

    return findEntryInLanguage(entryId, tag, app).then((entry) => {
        if (!entry) return entryNotFound();

        const { key } = entry;
        return localeEntryRepository.removeEntry(entry).then(() => {
            recordAudit(context, {
                action: localeAuditActions.ADMIN_LOCALE_ENTRY_DELETED,
                outcome: 'success',
                target_type: 'locale_entry',
                target_id: entryId,
                metadata: { locale: tag, app, key }
            });

            refreshOverlay();

            return generateSuccess({ key });
        });
    });
};

/**
 * Bulk import, in either of its two meanings.
 *
 * `replace` deletes keys the body did not name; `merge` leaves them alone — the only difference,
 * kept as one flag rather than two functions. The whole batch validates before anything writes: a
 * half-applied import is worse than a rejected one.
 */
export const importEntries = async (
    tag: string,
    app: LocaleApp,
    entries: readonly LocaleEntryInput[],
    mode: 'replace' | 'merge',
    context?: CallerContext
): Promise<ResponseSuccess<LocaleImportResult> | ResponseReject> => {
    const language = await localeRepository.findByTag(tag);
    if (!language) return languageNotFound();

    const unknownApp = rejectUnknownApp(app);
    if (unknownApp) return unknownApp;

    const inputs = entries.map(({ key, value }) => ({ key: key.trim(), value }));
    const keys = inputs.map(({ key }) => key);

    const duplicate = findDuplicateKey(keys);
    if (duplicate !== undefined)
        return generateReject(409, [t('locales.error-key-exists', { key: duplicate })]);

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
    const stored = await localeEntryRepository.listKeys(language.tag, app);
    const survivors = mode === 'replace' ? [] : stored.filter((key) => !incoming.has(key));

    for (const key of keys) {
        const unusable = rejectUnusableKey(key, survivors);
        if (unusable) return unusable;
    }

    const { counts, revision } = await localeEntryRepository.importEntries(
        language.tag,
        app,
        inputs,
        { replace: mode === 'replace' }
    );

    recordAudit(context, {
        action: localeAuditActions.ADMIN_LOCALE_ENTRY_IMPORTED,
        outcome: 'success',
        target_type: 'locale',
        target_id: language.tag,
        // `mode` is the field that makes this record worth keeping: a replace that
        // removed three hundred keys and a merge that added two are the same action name
        // and very different events. `app` says whose dictionary it happened to, which
        // the counts alone cannot.
        metadata: { mode, app, ...counts, revision }
    });

    refreshOverlay();

    return generateSuccess({ ...counts, revision });
};
