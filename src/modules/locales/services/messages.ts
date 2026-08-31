/**
 * @module
 * The two reads that hand out stored copy — a frontend's downloadable overrides, and the API's
 * own overlay.
 *
 * Both expand flat rows through {@link buildMessageTree}, and they differ in exactly one thing:
 * which tenant's keyspace they are allowed to serve.
 */

import type { LocaleMessages, LocaleTenant } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import {
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { localeMessageRepository, localeRepository } from '../repository';
import { backendTenant, frontendTenant, isFrontendTenant } from '../tenants';
import { buildMessageTree } from './keys';
import { languageNotFound } from './languages';

/**
 * The OVERRIDES a client downloads for one language — one frontend tenant's rows, never the
 * backend's.
 *
 * Not a dictionary: a client merges this over what it bundles, key by key, so a key nobody has
 * edited keeps its bundled text and a language nobody has finished falls back per key. Handing a
 * frontend the API's own rows instead would give it the backend's keyspace, which it did not
 * author and cannot render — so the backend tenant, and any id nobody configured, answer 404 here
 * exactly as an unknown language does.
 *
 * An INACTIVE language answers exactly as an unknown one does. Inactive means invisible to the
 * public, and a 403 or an empty 200 would both leak that the language exists — which is the one
 * thing a draft translation is being kept from doing.
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

    const entries = await localeMessageRepository.listEntries(language.tag, tenant);

    return generateSuccess({
        locale: language.tag,
        revision: language.revision,
        messages: buildMessageTree(entries)
    });
};

/**
 * Every override of the BACKEND tenant, grouped by language and expanded into trees.
 *
 * The provider `@infrastructure/i18n` calls to rebuild its overlay — see the "Database overrides"
 * block there for what the overlay guarantees. Nested here rather than there because expanding a
 * dotted key is this module's job: {@link buildMessageTree} is the one place that refuses
 * `__proto__` and reports a key that is both a string and a group.
 *
 * INACTIVE languages are included, and deliberately so. `active` governs what the PUBLIC can see —
 * the manifest and the downloadable dictionary — and an override is neither. Excluding them would
 * mean a language deactivated mid-translation silently reverted the backend copy already approved
 * for it, which is a different decision than "hide this from visitors".
 *
 * A key both a string and a group throws in the builder. That would take the whole refresh down,
 * so it is caught per language: one malformed dictionary costs its own overrides and leaves every
 * other language's applied.
 */
export const readApiOverrides = async (): Promise<Record<string, Record<string, unknown>>> => {
    const rows = await localeMessageRepository.listEntriesByTenant(backendTenant());

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
