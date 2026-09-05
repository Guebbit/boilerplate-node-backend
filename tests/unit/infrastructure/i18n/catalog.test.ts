/**
 * Where the dictionaries come from: discovery, the per-module merge, and the shape `i18next.init()`
 * is handed.
 *
 * The caching case is the one that matters most and is easiest to lose: the list is what init
 * registered its resources FROM, so a per-call re-read would let negotiation offer a language the
 * instance cannot resolve.
 */
import {
    listSupportedLocales,
    loadLocaleResources,
    readLocaleDictionary,
    resetSupportedLocales
} from '@infrastructure/i18n';
import enTranslation from '../../../../src/locales/en.json';
import enUsers from '@modules/users/locales/en.json';
import itTranslation from '../../../../src/locales/it.json';
import itUsers from '@modules/users/locales/it.json';

describe('locale discovery', () => {
    it('lists every dictionary in src/locales', () => {
        expect(listSupportedLocales()).toEqual(expect.arrayContaining(['en', 'it']));
    });

    it('honours NODE_SUPPORTED_LOCALES when set', () => {
        const original = process.env.NODE_SUPPORTED_LOCALES;
        process.env.NODE_SUPPORTED_LOCALES = 'en, it ,';
        resetSupportedLocales();

        try {
            expect(listSupportedLocales()).toEqual(['en', 'it']);
        } finally {
            if (original === undefined) delete process.env.NODE_SUPPORTED_LOCALES;
            else process.env.NODE_SUPPORTED_LOCALES = original;
            resetSupportedLocales();
        }
    });

    /**
     * The list is what `i18next.init()` registered its resources from, so re-reading the
     * directory per call would let negotiation offer a language the instance cannot resolve —
     * answering `Content-Language: xx` with fallback copy. Cached, the two cannot drift.
     */
    it('is cached, so it cannot drift from the resources i18next registered', () => {
        const first = listSupportedLocales();

        const original = process.env.NODE_SUPPORTED_LOCALES;
        process.env.NODE_SUPPORTED_LOCALES = 'kl';
        try {
            expect(listSupportedLocales()).toEqual(first);
        } finally {
            if (original === undefined) delete process.env.NODE_SUPPORTED_LOCALES;
            else process.env.NODE_SUPPORTED_LOCALES = original;
        }
    });

    it('reads a dictionary off disk, merged with every registered module', () => {
        const italian = readLocaleDictionary('it');

        // The shared half is carried through verbatim...
        expect(italian).toMatchObject(itTranslation);
        // ...and the modules layer their own namespaces on top. `users` is asserted rather than
        // just "something was added", so a merge that silently dropped a contribution fails.
        expect(italian.users).toMatchObject(itUsers.users);
    });

    it('shapes every dictionary for i18next.init', () => {
        expect(loadLocaleResources()).toMatchObject({
            en: { translation: enTranslation },
            it: { translation: itTranslation }
        });
    });

    // The shared file is resolved from the module's own location rather than from `process.cwd()`,
    // so a jest worker, a migration and `src/cluster.ts` all read the same directory.
    it('finds the shared dictionaries whatever the working directory is', () => {
        const originalCwd = process.cwd();
        process.chdir('/');

        try {
            expect(readLocaleDictionary('en')).toMatchObject(enTranslation);
        } finally {
            process.chdir(originalCwd);
        }
    });

    it('carries the shared keys a module did not contribute to', () => {
        expect(readLocaleDictionary('en').users).toMatchObject(enUsers.users);
    });
});
