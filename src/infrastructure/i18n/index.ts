/**
 * @module
 * Request-scoped i18n barrel — import `t` from here, never from `'i18next'` directly, since its
 * default export is one global instance with one active language and this file keeps that global
 * out of the request path (see `./context`). Re-exports `./catalog` (translations, including the
 * pure `localeCandidatesFor` chain), `./overrides` (admin overlay), `./served` (which languages a
 * request may be answered in), `./context` (per-request `t`)
 * and `./boot` (`bootI18n`, the shared instance startup). Every import site says
 * `@infrastructure/i18n`, except `./config`: its slice is imported per file, like every other
 * `config.ts`. A re-export here that nothing imports goes (this is not a module barrel).
 *
 * Two things this directory deliberately does NOT own: `Accept-Language` matching is
 * `attachLocale`'s own `request.acceptsLanguages` call (`http/middlewares/locale.ts`), not a
 * hand-rolled parser; the translation PORT — a module's published vocabulary — is
 * `kernel/translation.ts`, the same inversion `kernel/authentication.ts` already uses.
 *
 * @see docs/understand/i18n.md
 */

export {
    getDefaultLocale,
    getFallbackLocale,
    listSupportedLocales,
    loadLocaleResources,
    localeCandidatesFor,
    readLocaleDictionary,
    resetSupportedLocales
} from './catalog';

export { bootI18n } from './boot';

export {
    baseLanguage,
    canonicalLocale,
    canonicalLocaleSetter,
    isWellFormedLocale
} from './locale-tag';

export {
    getOverrideRefreshMs,
    isLocaleOverrideAvailable,
    refreshLocaleOverrides,
    registerLocaleOverrideProvider,
    resetLocaleOverrides,
    startLocaleOverrideRefresh,
    stopLocaleOverrideRefresh,
    type LocaleOverlay,
    type LocaleOverrideProvider
} from './overrides';

export {
    dictionaryLocaleFor,
    draftLocaleFor,
    hasServedDictionary,
    isServedLocale,
    listServedLocales,
    resetServedLanguages,
    servedLocaleFor,
    setServedLanguages
} from './served';

export {
    createLocaleContext,
    createPreviewContext,
    getCurrentLocale,
    getLocaleContext,
    runWithLocale,
    runWithLocaleContext,
    t,
    translator,
    type LocaleContext
} from './context';
