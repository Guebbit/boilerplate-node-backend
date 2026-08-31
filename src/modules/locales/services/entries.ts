/**
 * @module
 * The rows themselves — one language's translated keys, read a page at a time and written one key
 * or one batch at a time. Every write narrows to a single tenant: a key is unique only within one
 * keyspace, and a collision only matters inside the tree it shares.
 */

import type {
    CreateLocaleEntryRequest,
    LocaleEntryInput,
    LocaleImportResult,
    LocaleTenant,
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
import type { CallerContext } from '@infrastructure/http/request';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { localeAuditActions } from '../audit';
import type { LocaleMessageDocument } from '../model';
import { localeMessageRepository, localeRepository } from '../repository';
import { findBatchCollision, findDuplicateKey, rejectUnusableKey } from './keys';
import { languageNotFound, readableTenant, rejectUnknownTenant } from './languages';

/**
 * One page of a language's rows, for the editing screen.
 *
 * `tenant` goes through {@link readableTenant}, which drops an unknown id instead of refusing the
 * request — the lenient read half of the strict write policy in `rejectUnknownTenant`.
 */
export const searchEntries = async (
    tag: string,
    filters: {
        page?: string | number;
        pageSize?: string | number;
        text?: string;
        tenant?: LocaleTenant;
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
        await localeMessageRepository.search(
            { ...filters, tenant: readableTenant(filters.tenant) },
            { locale: language.tag },
            { key: 1 }
        )
    );
};

/**
 * Add one key to one language.
 * @param context - caller context for the `ADMIN_LOCALE_ENTRY_CREATED` audit emit; omitted by
 *   tests that call this as a plain helper — no context means no emit
 */
export const createEntry = async (
    tag: string,
    payload: CreateLocaleEntryRequest,
    context?: CallerContext
): Promise<ResponseSuccess<LocaleMessageDocument> | ResponseReject> => {
    const language = await localeRepository.findByTag(tag);
    if (!language) return languageNotFound();

    const unknownTenant = rejectUnknownTenant(payload.tenant);
    if (unknownTenant) return unknownTenant;

    const key = payload.key.trim();
    /*
     * Both checks below are narrowed to the tenant being written. The same key legitimately
     * exists in two tenants — `generic.error-internal` is one string in each — so checking against
     * every row would refuse the second half of a perfectly correct pair, and a collision between
     * `products.list` and `products.list.title` only matters inside the tree they share.
     */
    const existingKeys = await localeMessageRepository.listKeys(language.tag, payload.tenant);

    if (existingKeys.includes(key))
        return generateReject(409, [t('locales.error-key-exists', { key })]);

    const unusable = rejectUnusableKey(key, existingKeys);
    if (unusable) return unusable;

    const { entry } = await localeMessageRepository.createEntry(language.tag, payload.tenant, {
        key,
        value: payload.value
    });

    if (context)
        emitAuditEvent(
            buildAuditEvent(context, {
                action: localeAuditActions.ADMIN_LOCALE_ENTRY_CREATED,
                outcome: 'success',
                target_type: 'locale_entry',
                target_id: String(entry._id),
                metadata: { locale: language.tag, tenant: payload.tenant, key: payload.key }
            })
        );

    return generateSuccess(entry, 201);
};

/**
 * Change one entry's text.
 *
 * Looked up by id, then CHECKED against the language in the path — so
 * `PUT /locales/it/entries/<a spanish entry>` 404s rather than silently cross-editing.
 */
export const updateEntry = async (
    tag: string,
    entryId: string,
    payload: UpdateLocaleEntryRequest,
    context?: CallerContext
): Promise<ResponseSuccess<LocaleMessageDocument> | ResponseReject> => {
    const entry = await localeMessageRepository.findById(entryId);
    if (entry?.locale !== tag.trim().toLowerCase())
        return generateReject(404, [t('locales.error-entry-not-found')]);

    const { entry: saved } = await localeMessageRepository.saveEntryValue(entry, payload.value);

    if (context)
        emitAuditEvent(
            buildAuditEvent(context, {
                action: localeAuditActions.ADMIN_LOCALE_ENTRY_UPDATED,
                outcome: 'success',
                target_type: 'locale_entry',
                target_id: entryId,
                // The key, not the new text. An audit trail records that the Spanish product
                // title changed and who changed it; storing the copy itself would make the trail
                // a second, unmanaged copy of the dictionary.
                metadata: { locale: tag, key: saved.key }
            })
        );

    return generateSuccess(saved);
};

/**
 * Remove one key from one language. The other languages keep theirs.
 * @param context - caller context for the `ADMIN_LOCALE_ENTRY_DELETED` audit emit; omitted by
 *   tests that call this as a plain helper — no context means no emit
 */
export const deleteEntry = async (
    tag: string,
    entryId: string,
    context?: CallerContext
): Promise<ResponseSuccess<{ key: string }> | ResponseReject> => {
    const entry = await localeMessageRepository.findById(entryId);
    if (entry?.locale !== tag.trim().toLowerCase())
        return generateReject(404, [t('locales.error-entry-not-found')]);

    const { key } = entry;
    await localeMessageRepository.removeEntry(entry);

    if (context)
        emitAuditEvent(
            buildAuditEvent(context, {
                action: localeAuditActions.ADMIN_LOCALE_ENTRY_DELETED,
                outcome: 'success',
                target_type: 'locale_entry',
                target_id: entryId,
                metadata: { locale: tag, key }
            })
        );

    return generateSuccess({ key });
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
    tenant: LocaleTenant,
    entries: readonly LocaleEntryInput[],
    mode: 'replace' | 'merge',
    context?: CallerContext
): Promise<ResponseSuccess<LocaleImportResult> | ResponseReject> => {
    const language = await localeRepository.findByTag(tag);
    if (!language) return languageNotFound();

    const unknownTenant = rejectUnknownTenant(tenant);
    if (unknownTenant) return unknownTenant;

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
    const stored = await localeMessageRepository.listKeys(language.tag, tenant);
    const survivors = mode === 'replace' ? [] : stored.filter((key) => !incoming.has(key));

    for (const key of keys) {
        const unusable = rejectUnusableKey(key, survivors);
        if (unusable) return unusable;
    }

    const { counts, revision } = await localeMessageRepository.importEntries(
        language.tag,
        tenant,
        inputs,
        { replace: mode === 'replace' }
    );

    if (context)
        emitAuditEvent(
            buildAuditEvent(context, {
                action: localeAuditActions.ADMIN_LOCALE_ENTRY_IMPORTED,
                outcome: 'success',
                target_type: 'locale',
                target_id: language.tag,
                // `mode` is the field that makes this record worth keeping: a replace that
                // removed three hundred keys and a merge that added two are the same action name
                // and very different events. `tenant` says whose dictionary it happened to, which
                // the counts alone cannot.
                metadata: { mode, tenant, ...counts, revision }
            })
        );

    return generateSuccess({ ...counts, revision });
};
