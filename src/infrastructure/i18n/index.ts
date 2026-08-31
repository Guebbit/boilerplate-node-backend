/**
 * @module
 * Request-scoped i18n barrel — import `t` from here, never from `'i18next'` directly, since its
 * default export is one global instance with one active language and this file keeps that global
 * out of the request path (see `./context`). Re-exports `./catalog` (translations), `./overrides`
 * (admin overlay), `./context` (per-request `t`) and `./negotiate` (`Accept-Language` matching);
 * all ~70 import sites say `@infrastructure/i18n`.
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
