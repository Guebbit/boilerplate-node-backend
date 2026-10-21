/**
 * The served languages — `src/infrastructure/i18n/served.ts` and what it changes in `./context`.
 *
 * One rule runs through all of it: FE files, BE files and DB records agree on ONE language per
 * request, and a language that is switched off is never that one. A registered language with no
 * deployed file is served — product text and screen copy exist for it — but the API has no wording
 * of its own in it, so each message falls back to the default language, key by key.
 *
 * `i18next` is initialised per test for the same reason `overrides.test.ts` does it: the resources
 * are a global, and a leaked bundle would make the next test depend on order.
 */
import i18next from 'i18next';
import {
    createLocaleContext,
    getFallbackLocale,
    hasServedDictionary,
    isServedLocale,
    listServedLocales,
    listSupportedLocales,
    loadLocaleResources,
    refreshLocaleOverrides,
    registerLocaleOverrideProvider,
    resetLocaleOverrides,
    runWithLocale,
    setServedLanguages,
    t,
    translator,
    type LocaleOverlay
} from '@infrastructure/i18n';
import enTranslation from '../../../../src/locales/en.json';
import itTranslation from '../../../../src/locales/it.json';

/** A provider answer carrying only the registered languages' on/off state. */
const languagesOf = (activeTags: string[], inactiveTags: string[]): LocaleOverlay => ({
    overrides: {},
    activeTags,
    inactiveTags
});

describe('the served languages', () => {
    beforeEach(async () => {
        registerLocaleOverrideProvider(undefined);
        await i18next.init({
            lng: 'en',
            fallbackLng: 'en',
            supportedLngs: listSupportedLocales(),
            resources: loadLocaleResources()
        });
    });

    afterEach(() => {
        registerLocaleOverrideProvider(undefined);
        resetLocaleOverrides();
    });

    describe('listServedLocales', () => {
        it('is the deployed files, fallback first, before any refresh has landed', () => {
            expect(listServedLocales()).toEqual([
                getFallbackLocale(),
                ...listSupportedLocales().filter((tag) => tag !== getFallbackLocale())
            ]);
        });

        it('adds a registered language that is switched on', () => {
            setServedLanguages(['es'], []);

            expect(listServedLocales()).toContain('es');
        });

        it('drops a deployed language that is switched off', () => {
            setServedLanguages([], ['it']);

            expect(listServedLocales()).not.toContain('it');
        });

        it('never drops the fallback, whatever the rows say', () => {
            setServedLanguages([], [getFallbackLocale()]);

            expect(listServedLocales()[0]).toBe(getFallbackLocale());
        });

        it('lists each language once when a deployed one is also registered', () => {
            setServedLanguages(['it', 'es'], []);

            expect(listServedLocales().filter((tag) => tag === 'it')).toHaveLength(1);
        });
    });

    describe('one refresh fills the copy and the languages together', () => {
        it('serves a language the refresh found switched on', async () => {
            registerLocaleOverrideProvider(() => Promise.resolve(languagesOf(['es'], [])));

            await refreshLocaleOverrides();

            expect(isServedLocale('es')).toBe(true);
        });

        it('drops a language the next refresh finds switched off', async () => {
            registerLocaleOverrideProvider(() => Promise.resolve(languagesOf(['es'], [])));
            await refreshLocaleOverrides();

            registerLocaleOverrideProvider(() => Promise.resolve(languagesOf([], ['es'])));
            await refreshLocaleOverrides();

            expect(isServedLocale('es')).toBe(false);
        });

        // Stale beats a flapping list: a Mongo hiccup must not switch a language off for visitors.
        it('keeps the last good list when the provider fails', async () => {
            registerLocaleOverrideProvider(() => Promise.resolve(languagesOf(['es'], ['it'])));
            await refreshLocaleOverrides();

            registerLocaleOverrideProvider(() => Promise.reject(new Error('mongo is down')));
            await refreshLocaleOverrides();

            expect(isServedLocale('es')).toBe(true);
            expect(isServedLocale('it')).toBe(false);
        });
    });

    describe('hasServedDictionary', () => {
        it('is true for a deployed file that is on', () => {
            expect(hasServedDictionary('it')).toBe(true);
        });

        it('is false for a registered language with no file', () => {
            setServedLanguages(['es'], []);

            expect(hasServedDictionary('es')).toBe(false);
        });

        it('is false for a deployed file that is switched off', () => {
            setServedLanguages([], ['it']);

            expect(hasServedDictionary('it')).toBe(false);
        });
    });

    describe('the context a request runs in', () => {
        it('keeps a served registered language as the locale, so product text is read in it', () => {
            setServedLanguages(['es'], []);

            expect(createLocaleContext('es').locale).toBe('es');
        });

        it('words a registered language without a file in the fallback language, key by key', () => {
            setServedLanguages(['es'], []);

            const context = createLocaleContext('es');

            expect(context.t('generic.error-unauthorized')).toBe(
                enTranslation.generic['error-unauthorized']
            );
        });

        it("uses the language's own file when it has one", () => {
            expect(createLocaleContext('it').t('generic.error-unauthorized')).toBe(
                itTranslation.generic['error-unauthorized']
            );
        });

        // A user who saved Italian before it was switched off: their next request, mail and order
        // snapshot are in the default language, not a language the shop no longer serves.
        it('falls back for a language switched off since it was saved', () => {
            setServedLanguages([], ['it']);

            const context = createLocaleContext('it');

            expect(context.locale).toBe(getFallbackLocale());
            expect(context.t('generic.error-unauthorized')).toBe(
                enTranslation.generic['error-unauthorized']
            );
        });

        it('falls back for a language nobody registered', () => {
            expect(createLocaleContext('xx').locale).toBe(getFallbackLocale());
        });

        // The resolver walks the tag, its base language and the fallback, so a regional tag whose
        // base is served keeps its own tag and speaks its base language's words.
        it('lets a regional tag follow its served base language', () => {
            const context = createLocaleContext('it-CH');

            expect(context.locale).toBe('it-CH');
            expect(context.t('generic.error-unauthorized')).toBe(
                itTranslation.generic['error-unauthorized']
            );
        });

        it('falls back for a regional tag whose base language is switched off', () => {
            setServedLanguages([], ['it']);

            expect(createLocaleContext('it-CH').locale).toBe(getFallbackLocale());
        });

        it('hands the ambient t the same binding inside the context', () => {
            setServedLanguages([], ['it']);

            expect(runWithLocale('it', () => t('generic.error-unauthorized'))).toBe(
                enTranslation.generic['error-unauthorized']
            );
        });
    });

    describe('translator', () => {
        // The mail builders bind a recipient's saved language through this, outside any request.
        it('words an email for a recipient whose language was switched off in the fallback', () => {
            setServedLanguages([], ['it']);

            expect(translator('it')('generic.error-unauthorized')).toBe(
                enTranslation.generic['error-unauthorized']
            );
        });

        it('words an email for a recipient whose language has no file in the fallback', () => {
            setServedLanguages(['es'], []);

            expect(translator('es')('generic.error-unauthorized')).toBe(
                enTranslation.generic['error-unauthorized']
            );
        });

        it('does not make i18next log a rejection for a language it was never given', () => {
            setServedLanguages(['es'], []);
            const log = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

            translator('es')('generic.error-unauthorized');

            expect(log).not.toHaveBeenCalled();
            log.mockRestore();
        });
    });
});
