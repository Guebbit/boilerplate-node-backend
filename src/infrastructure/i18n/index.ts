/**
 * @module
 * Request-scoped i18n barrel — import `t` from here, never from `'i18next'` directly, since its
 * default export is one global instance with one active language and this file keeps that global
 * out of the request path (see `./context`). Re-exports `./catalog` (translations), `./overrides`
 * (admin overlay), `./context` (per-request `t`), `./negotiate` (`Accept-Language` matching) and
 * `./translation` (user-authored content, resolved by a registered port); all ~70 import sites
 * say `@infrastructure/i18n`.
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

export {
    applyTranslations,
    localeCandidatesFor,
    planTranslations,
    registerTranslationPort,
    removeTranslations,
    resolveTranslations,
    searchTranslatedEntityIds,
    writeTranslations,
    type TranslatedFields,
    type Translatable,
    type TranslationPort,
    type TranslationWritePlan,
    type TranslationWriteSlot
} from './translation';
