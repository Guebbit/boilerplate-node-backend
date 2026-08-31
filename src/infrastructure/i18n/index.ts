/**
 * @module
 * Request-scoped i18n. Import `t` from here, never from `'i18next'` — its default export is one
 * global instance with one active language, and this barrel exists to keep that global out of the
 * request path (see `./context`).
 *
 * Four files, one entry point: `./catalog` (translations), `./overrides` (admin-editable overlay),
 * `./context` (the AsyncLocalStorage carrying one request's `t`), and `./negotiate`
 * (`Accept-Language` → supported locale). All ~70 import sites say `@infrastructure/i18n`.
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
