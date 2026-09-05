/**
 * @module
 * The two reads that hand out stored copy — a frontend's downloadable overrides, and the API's own
 * overlay. Both expand flat rows through {@link buildMessageTree}, differing in exactly one thing:
 * which tenant's keyspace each is allowed to serve.
 */

import type { LocaleMessages, LocaleTenant } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import {
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { localeEntryRepository, localeRepository } from '../repository';
import { backendTenant, frontendTenant, isFrontendTenant } from '../tenants';
import { buildMessageTree } from './keys';
import { languageNotFound } from './languages';

/**
 * The OVERRIDES a client downloads for one language — one frontend tenant's rows, never the
 * backend's. Not a dictionary: a client merges this over what it bundles, key by key, so a
 * language nobody has finished falls back per key.
 *
 * The backend tenant, an unconfigured id, and an INACTIVE language all answer 404 exactly as an
 * unknown language does — a 403 or empty 200 for "inactive" would leak that a draft translation
 * exists.
 *
 * @param tenant - whose dictionary; omitted, the deployment's default frontend tenant
 */
export const readMessages = async (
    tag: string,
    tenant: LocaleTenant = frontendTenant()
): Promise<ResponseSuccess<LocaleMessages> | ResponseReject> => {
    if (!isFrontendTenant(tenant)) return languageNotFound();

    const language = await localeRepository.findByTag(tag);
    if (!language?.active) return languageNotFound();

    const entries = await localeEntryRepository.listEntries(language.tag, tenant);

    return generateSuccess({
        locale: language.tag,
        revision: language.revision,
        messages: buildMessageTree(entries)
    });
};

/**
 * Every override of the BACKEND tenant, grouped by language and expanded into trees. The provider
 * `@infrastructure/i18n` calls to rebuild its overlay.
 *
 * INACTIVE languages are included on purpose: `active` governs what the PUBLIC can see, and an
 * override is neither — excluding them would silently revert backend copy mid-translation.
 *
 * A key that is both a string and a group throws in the builder; caught per language so one
 * malformed dictionary does not take the whole refresh down.
 */
export const readApiOverrides = async (): Promise<Record<string, Record<string, unknown>>> => {
    const rows = await localeEntryRepository.listEntriesByTenant(backendTenant());

    const byLocale = new Map<string, { key: string; value: string }[]>();
    for (const { locale, key, value } of rows)
        byLocale.set(locale, [...(byLocale.get(locale) ?? []), { key, value }]);

    const overrides: Record<string, Record<string, unknown>> = {};
    for (const [locale, entries] of byLocale) {
        // eslint-disable-next-line no-restricted-syntax -- caught per locale: one language's malformed keys must not take down the rest
        try {
            overrides[locale] = buildMessageTree(entries);
        } catch (error) {
            logger.warn('readApiOverrides - skipping a language whose keys cannot form a tree', {
                detail: `${locale}: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    return overrides;
};
