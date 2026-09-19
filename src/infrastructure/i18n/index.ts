/**
 * @module
 * Request-scoped i18n barrel — import `t` from here, never from `'i18next'` directly, since its
 * default export is one global instance with one active language and this file keeps that global
 * out of the request path (see `./context`). Re-exports `./catalog` (translations, including the
 * pure `localeCandidatesFor` chain), `./overrides` (admin overlay) and `./context` (per-request
 * `t`); all ~70 import sites say `@infrastructure/i18n`.
 *
 * Two things this directory deliberately does NOT own: `Accept-Language` matching is
 * `attachLocale`'s own `request.acceptsLanguages` call (`http/middlewares/locale.ts`), not a
 * hand-rolled parser; the translation PORT — a module's published vocabulary — is
 * `kernel/translation.ts`, the same inversion `kernel/authentication.ts` already uses.
 *
 * See: docs/tools/i18n.md
 */

export {
    getDefaultLocale,
    getFallbackLocale,
    listSupportedLocales,
    loadLocaleResources,
    localeCandidatesFor,
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
