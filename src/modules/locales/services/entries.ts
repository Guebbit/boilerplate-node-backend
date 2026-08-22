/**
 * The rows themselves — one language's translated keys, read a page at a time and written one key
 * or one batch at a time.
 *
 * Every write here narrows to a single tenant, because a key is only unique within one keyspace
 * and a collision only matters inside the tree it would share.
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
import type { LocaleMessageDocument } from '../model';
import { localeMessageRepository, localeRepository } from '../repository';
import {
    findBatchCollision,
    findDuplicateKey,
    findUnsafeKeySegment,
    rejectUnusableKey
} from './keys';
import { languageNotFound, rejectUnknownTenant } from './languages';

/** One page of a language's rows, for the editing screen. */
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
        await localeMessageRepository.search(filters, { locale: language.tag }, { key: 1 })
    );
};

/** Add one key to one language. */
export const createEntry = async (
    tag: string,
    payload: CreateLocaleEntryRequest
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
    tenant: LocaleTenant,
    entries: readonly LocaleEntryInput[],
    mode: 'replace' | 'merge'
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

    return generateSuccess({ ...counts, revision });
};
