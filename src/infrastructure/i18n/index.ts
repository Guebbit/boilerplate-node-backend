/**
 * Request-scoped i18n.
 *
 * Import `t` from here, never from `'i18next'` — the library's default export is one global
 * instance with one active language, and this module exists to keep that global out of the
 * request path. `./context` explains what goes wrong when it does not.
 *
 * Four change drivers, four files, one entry point:
 *
 *   `./catalog`    where translations come from: discovery, per-module merge, boot resources
 *   `./overrides`  the admin-editable database overlay on top of them — deletable as a unit
 *   `./context`    the AsyncLocalStorage carrying one request's `t`, and the ambient `t` itself
 *   `./negotiate`  turning an `Accept-Language` header into one supported locale
 *
 * The barrel is what makes that split free: all 70 import sites say `@infrastructure/i18n` and do
 * not care which file answers. Reach for a submodule directly only from within this directory —
 * `overrides` imports `catalog`, which is the one edge between them and points one way.
 *
 * See: docs/tools/i18n.md
 */

export {
    getDefaultLocale,
    getFallbackLocale,
    listSupportedLocales,
    loadLocaleResources,
    readLocaleDictionary,
    registerLocaleDirectories,
    resetSupportedLocales
} from './catalog';

export {
    applyLocaleOverrides,
    getOverrideRefreshMs,
    refreshLocaleOverrides,
    registerLocaleOverrideProvider,
    resetLocaleOverrides,
    startLocaleOverrideRefresh,
    stopLocaleOverrideRefresh,
    type LocaleOverrideProvider
} from './overrides';

export {
    createLocaleContext,
    getCurrentLocale,
    getLocaleContext,
    runWithLocale,
    runWithLocaleContext,
    t,
    translator,
    type LocaleContext
} from './context';

export { negotiateLocale } from './negotiate';
