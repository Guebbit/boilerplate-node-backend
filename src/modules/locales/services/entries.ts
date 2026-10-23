/**
 * @module
 * The rows themselves — one language's translated keys, read a page at a time and written one key
 * or one batch at a time. Every write narrows to a single app: a key is unique only within one
 * keyspace, and a collision only matters inside the tree it shares.
 */

import type {
    CreateLocaleEntryRequest,
    LocaleEntry,
    LocaleImportResult,
    LocaleApp,
    ReplaceLocaleEntryRequest
} from '@types';
import { ERROR_CODES } from '@api/error-codes';
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
import { localeEntryRepository, localeRepository, type EntryChange } from '../repository';
import { findBatchCollision, findDuplicateKey, isKeyLengthValid, rejectUnusableKey } from './keys';
import { languageNotFound, rejectUnknownApp } from './languages';
import { refreshOverlay } from './overlay';

/** Not found, phrased the one way {@link findEntryInLanguage} and its two callers all mean it. */
const entryNotFound = (): ResponseReject =>
    generateReject(404, [
        { code: ERROR_CODES.LOCALE_ENTRY_NOT_FOUND, message: t('locales.error-entry-not-found') }
    ]);

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
         * a translator reads an alphabetical list. The unique index is `(locale, app, key)`, so
         * without an `app` filter one key repeats once per app: `app` breaks that tie, and the
         * repository closes the order with `_id`.
         */
        return localeEntryRepository
            .search(filters, { locale: language.tag }, { key: 1, app: 1 })
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
        return generateReject(409, [
            {
                code: ERROR_CODES.LOCALE_ENTRY_KEY_EXISTS,
                message: t('locales.error-key-exists', { key })
            }
        ]);

    const unusable = rejectUnusableKey(key, existingKeys);
    if (unusable) return unusable;

    const { entry } = await localeEntryRepository.createEntry(language.tag, app, {
        key,
        value: payload.value
    });

    recordAudit(context, {
        action: localeAuditActions.ADMIN_LOCALE_ENTRY_CREATED,
        outcome: 'success',
        targetType: 'locale_entry',
        targetId: String(entry._id),
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
    payload: ReplaceLocaleEntryRequest,
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
                    targetType: 'locale_entry',
                    targetId: entryId,
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
export const removeEntry = (
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
                targetType: 'locale_entry',
                targetId: entryId,
                metadata: { locale: tag, app, key }
            });

            refreshOverlay();

            return generateSuccess({ key });
        });
    });
};

/**
 * Rejects a bulk import whose keys cannot be stored, before anything is read or written.
 *
 * A key outside 1 to 200 characters is a 422, two keys equal once trimmed a 409; an empty
 * `merge` is a 422 (nothing to change). `null` keys take part: a `null` for a key that is not
 * stored is a no-op, but a key that could never exist is still a malformed request.
 */
const rejectBadBatch = (
    inputs: readonly EntryChange[],
    mode: 'replace' | 'merge'
): ResponseReject | undefined => {
    if (mode === 'merge' && inputs.length === 0)
        return generateReject(422, [
            { code: ERROR_CODES.LOCALE_ENTRIES_EMPTY, message: t('locales.error-entries-empty') }
        ]);

    const keys = inputs.map(({ key }) => key);

    const badKey = keys.find((key) => !isKeyLengthValid(key));
    if (badKey !== undefined)
        return generateReject(422, [
            {
                code: ERROR_CODES.LOCALE_ENTRY_KEY_INVALID,
                message: t('locales.error-key-invalid', { key: badKey })
            }
        ]);

    const duplicate = findDuplicateKey(keys);
    if (duplicate !== undefined)
        return generateReject(409, [
            {
                code: ERROR_CODES.LOCALE_ENTRY_KEY_EXISTS,
                message: t('locales.error-key-exists', { key: duplicate })
            }
        ]);

    return undefined;
};

/**
 * Bulk import, in either of its two meanings.
 *
 * `replace` deletes keys the body did not name; `merge` leaves them alone — the only difference,
 * kept as one flag rather than two functions. A `null` value deletes its key under `merge`
 * (`replace` bodies never carry one). The whole batch validates before anything writes: a
 * half-applied import is worse than a rejected one.
 */
export const importEntries = async (
    tag: string,
    app: LocaleApp,
    entries: Readonly<Record<string, string | null>>,
    mode: 'replace' | 'merge',
    context?: CallerContext
): Promise<ResponseSuccess<LocaleImportResult> | ResponseReject> => {
    const language = await localeRepository.findByTag(tag);
    if (!language) return languageNotFound();

    const unknownApp = rejectUnknownApp(app);
    if (unknownApp) return unknownApp;

    const inputs: EntryChange[] = Object.entries(entries).map(([key, value]) => ({
        key: key.trim(),
        value
    }));

    const badBatch = rejectBadBatch(inputs, mode);
    if (badBatch) return badBatch;

    // A key being deleted is outside every collision check below: it will not exist afterwards.
    const written = inputs.filter(({ value }) => value !== null).map(({ key }) => key);
    const deleted = new Set(inputs.filter(({ value }) => value === null).map(({ key }) => key));

    const batchCollision = findBatchCollision(written);
    if (batchCollision)
        return generateReject(409, [
            {
                code: ERROR_CODES.LOCALE_ENTRY_KEY_COLLISION,
                message: t('locales.error-key-collision', {
                    key: batchCollision[0],
                    existing: batchCollision[1]
                })
            }
        ]);

    /*
     * What the batch will have to coexist with once it lands. For a replace that is nothing —
     * every stored key it does not name is about to be deleted — and for a merge it is the stored
     * keys the batch neither writes nor deletes. Checking the batch against keys it is about to
     * overwrite or remove would refuse imports that are perfectly consistent with themselves.
     */
    const incoming = new Set(written);
    const stored = await localeEntryRepository.listKeys(language.tag, app);
    const survivors =
        mode === 'replace' ? [] : stored.filter((key) => !incoming.has(key) && !deleted.has(key));

    for (const key of written) {
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
        targetType: 'locale',
        targetId: language.tag,
        // `mode` is the field that makes this record worth keeping: a replace that
        // removed three hundred keys and a merge that added two are the same action name
        // and very different events. `app` says whose dictionary it happened to, which
        // the counts alone cannot.
        metadata: { mode, app, ...counts, revision }
    });

    refreshOverlay();

    return generateSuccess({ ...counts, revision });
};
