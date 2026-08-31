/**
 * @module
 * The database overlay: admin-edited copy applied on top of the deployed dictionaries.
 *
 * The files under `./catalog` are DEFAULTS; this tier overrides them. Three properties it keeps:
 * nothing here is awaited on the request path, a refresh restores the file baseline BEFORE
 * re-applying, and only a language with a file can be overridden.
 *
 * This is the tier a project is most likely to want gone. It imports `./catalog` and nothing
 * imports it back, so deleting this file and its two lines in the boot sequence removes the
 * feature — which is the point of it being a file rather than a section.
 *
 * See: docs/tools/i18n.md#database-overrides
 */

import i18next from 'i18next';
import { logger } from '@infrastructure/adapters/logger';
import { listSupportedLocales, readLocaleDictionary } from './catalog';
import { environmentNumber } from '@infrastructure/runtime/environment';

/**
 * Supplies the current overrides, keyed by locale, already nested.
 *
 * Nested rather than flat because the rows are flat and only the `locales` module knows how to
 * expand a dotted key safely — that expansion refuses `__proto__` and reports a key that is both a
 * string and a group, neither of which `infrastructure` should be reimplementing.
 *
 * Registered from the composition root for the same reason `registerLocaleDirectories` is:
 * `infrastructure` sits below every module and may not import one.
 */
export type LocaleOverrideProvider = () => Promise<Record<string, Record<string, unknown>>>;

/** The registered provider, or `undefined` before the composition root has supplied one. */
let overrideProvider: LocaleOverrideProvider | undefined;

/**
 * Declare where overrides come from, replacing any previous provider.
 *
 * Unregistered is a valid state and the default one: unit tests that resolve a key without booting
 * the app get the deployed files and nothing else.
 */
export const registerLocaleOverrideProvider = (provider?: LocaleOverrideProvider): void => {
    overrideProvider = provider;
};

/**
 * Restore every supported language to its deployed files, dropping any applied override.
 *
 * The path a failed refresh does NOT take — a provider that throws leaves the last good overlay in
 * place, because stale copy beats copy that reverts itself every time Mongo hiccups. This exists
 * for shutdown and for tests, which need a clean instance rather than a plausible one.
 */
export const resetLocaleOverrides = (): void => {
    for (const locale of listSupportedLocales())
        i18next.addResourceBundle(locale, 'translation', readLocaleDictionary(locale), true, true);
};

/**
 * Re-apply the file baseline and layer the current overrides on top of it.
 *
 * `deep` and `overwrite` are both on: an override names one leaf, and the other keys of its
 * namespace must survive the merge.
 *
 * @param overridesByLocale - nested override trees, keyed by locale
 */
export const applyLocaleOverrides = (
    overridesByLocale: Record<string, Record<string, unknown>>
): void => {
    const supported = new Set(listSupportedLocales());

    /*
     * EVERY supported language is restored, not only the ones this call carries overrides for —
     * otherwise deleting the last override of a language would restore nothing and change nothing.
     *
     * Synchronous to the end of the loop below, so nothing observes a language briefly back on its
     * file.
     */
    resetLocaleOverrides();

    const skipped: string[] = [];

    for (const [locale, overrides] of Object.entries(overridesByLocale)) {
        if (!supported.has(locale)) {
            skipped.push(locale);
            continue;
        }

        i18next.addResourceBundle(locale, 'translation', overrides, true, true);
    }

    if (skipped.length > 0)
        logger.warn(
            'applyLocaleOverrides - overrides stored for languages this API cannot answer',
            {
                detail: `no dictionary file is deployed for ${skipped.join(', ')}; rows ignored`
            }
        );
};

/**
 * Pull the current overrides and apply them. Never rejects.
 *
 * Swallowing the failure is the whole point: this runs at boot, on a timer and after every admin
 * write, and none of those callers has a user to report to. A database that cannot be read costs
 * the overrides and nothing else.
 */
export const refreshLocaleOverrides = (): Promise<void> => {
    if (!overrideProvider) return Promise.resolve();

    return overrideProvider()
        .then((overrides) => applyLocaleOverrides(overrides))
        .catch((error: unknown) => {
            logger.warn(
                'refreshLocaleOverrides - locale overrides unavailable, keeping the last set',
                {
                    detail: error instanceof Error ? error.message : String(error)
                }
            );
        });
};

/** How long a worker may serve copy edited by another worker. */
export const getOverrideRefreshMs = (): number =>
    environmentNumber('NODE_LOCALE_OVERRIDE_REFRESH_MS', 60_000, 1);

/** The interval handle from {@link startLocaleOverrideRefresh}, or `undefined` when stopped. */
let refreshTimer: NodeJS.Timeout | undefined;

/**
 * Start re-reading the overrides on an interval, so an edit made on one worker reaches the others.
 *
 * `unref` so the timer never holds the process open — a worker with nothing left to do must exit,
 * and a pending copy refresh is not a reason to stay.
 */
export const startLocaleOverrideRefresh = (): void => {
    if (refreshTimer) return;
    refreshTimer = setInterval(() => void refreshLocaleOverrides(), getOverrideRefreshMs());
    refreshTimer.unref();
};

/** Stop the interval. Called by the shutdown path and by tests. */
export const stopLocaleOverrideRefresh = (): void => {
    if (!refreshTimer) return;
    clearInterval(refreshTimer);
    refreshTimer = undefined;
};
