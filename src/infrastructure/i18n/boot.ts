/**
 * @module
 * Brings up the one global i18next instance every entry point shares: `app.ts`'s real boot,
 * `reap-inactive-accounts.ts` rendering email copy outside the HTTP process, and jest's own
 * global setup binding the suite's `en`. Each caller owns HOW it finds its locale directories — a
 * module registry, a disk glob, or a mock-safe read done before the framework installs — so this
 * only takes the resolved list.
 *
 * See: docs/tools/i18n.md
 */

import i18next from 'i18next';
import type { TFunction } from 'i18next';
import {
    getDefaultLocale,
    getFallbackLocale,
    listSupportedLocales,
    loadLocaleResources,
    registerLocaleDirectories
} from './catalog';

/**
 * Registers `localeDirectories` and brings the global i18next instance up with every supported
 * dictionary loaded.
 *
 * Must run before anything calls `t()` — `registerValidationMessages()` in particular, which
 * installs Zod's own error map through it.
 *
 * @param localeDirectories - absolute paths, each expected to hold `<locale>.json` files
 * @param lng - the language i18next boots active in; defaults to {@link getDefaultLocale}, which
 *   is what production boot and the ops script both want. A caller forcing a specific language
 *   (jest's global setup, pinned to `en`) passes it explicitly.
 */
export const bootI18n = (
    localeDirectories: string[],
    lng = getDefaultLocale()
): Promise<TFunction> => {
    registerLocaleDirectories(localeDirectories);

    return i18next.init({
        lng,
        fallbackLng: getFallbackLocale(),
        supportedLngs: listSupportedLocales(),
        resources: loadLocaleResources()
    });
};
