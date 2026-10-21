/**
 * @module
 * The two reads that hand out stored copy — a frontend's downloadable overrides, and the API's own
 * overlay. Both expand flat rows through {@link buildMessageTree}, differing in exactly one thing:
 * which app's keyspace each is allowed to serve.
 */

import type { LocaleMessages, LocaleApp } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import type { LocaleOverlay } from '@infrastructure/i18n';
import {
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { localeEntryRepository, localeRepository } from '../repository';
import { backendApp, frontendApp, isFrontendApp } from '../apps';
import { buildMessageTree } from './keys';
import { languageNotFound } from './languages';

/**
 * The OVERRIDES a client downloads for one language — one frontend app's rows, never the
 * backend's. Not a dictionary: a client merges this over what it bundles, key by key, so a
 * language nobody has finished falls back per key.
 *
 * The backend app, an unconfigured id, and an INACTIVE language all answer 404 exactly as an
 * unknown language does — a 403 or empty 200 for "inactive" would leak that a draft translation
 * exists. The one exception is a caller who may read inactive languages (`includeInactive`): staff
 * previewing a draft before it goes live.
 *
 * @param app - whose dictionary; omitted, the deployment's default frontend app
 * @param includeInactive - the caller's read scope reaches inactive languages (see `callerScope`)
 */
export const readMessages = (
    tag: string,
    app: LocaleApp = frontendApp(),
    includeInactive = false
): Promise<ResponseSuccess<LocaleMessages> | ResponseReject> => {
    if (!isFrontendApp(app)) return Promise.resolve(languageNotFound());

    return localeRepository.findByTag(tag).then((language) => {
        if (!language || !(language.active || includeInactive)) return languageNotFound();

        return localeEntryRepository.listEntries(language.tag, app).then((entries) =>
            generateSuccess({
                locale: language.tag,
                revision: language.revision,
                messages: buildMessageTree(entries)
            })
        );
    });
};

/**
 * Every override of the BACKEND app, grouped by language and expanded into trees. The provider
 * `@infrastructure/i18n` calls to rebuild its overlay.
 *
 * INACTIVE languages are included on purpose: `active` governs what the PUBLIC can see, and an
 * override is neither — excluding them would silently revert backend copy mid-translation.
 *
 * A key that is both a string and a group throws in the builder; caught per language so one
 * malformed dictionary does not take the whole refresh down.
 */
export const readApiOverrides = (): Promise<Record<string, Record<string, unknown>>> =>
    localeEntryRepository.listEntriesByApp(backendApp()).then((rows) => {
        const byLocale = new Map<string, { key: string; value: string }[]>();
        for (const { locale, key, value } of rows) {
            const entries = byLocale.get(locale) ?? [];
            entries.push({ key, value });
            byLocale.set(locale, entries);
        }

        const overrides: Record<string, Record<string, unknown>> = {};
        for (const [locale, entries] of byLocale) {
            // eslint-disable-next-line no-restricted-syntax -- caught per locale: one language's malformed keys must not take down the rest
            try {
                overrides[locale] = buildMessageTree(entries);
            } catch (error) {
                // Stryker disable all
                logger.warn(
                    'readApiOverrides - skipping a language whose keys cannot form a tree',
                    {
                        locale,
                        error
                    }
                );
                // Stryker restore all
            }
        }

        return overrides;
    });

/**
 * What one refresh of `@infrastructure/i18n` reads: the API's own overrides, and which registered
 * languages are switched on or off. One function so the copy and the served-language list come
 * from the same refresh, and any failed read leaves the last good set of BOTH in place.
 */
export const readLocaleOverlay = (): Promise<LocaleOverlay> =>
    Promise.all([
        readApiOverrides(),
        localeRepository.listActiveTags(),
        localeRepository.listInactiveTags()
    ]).then(([overrides, activeTags, inactiveTags]) => ({ overrides, activeTags, inactiveTags }));
