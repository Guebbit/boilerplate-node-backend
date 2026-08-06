/**
 * Unit tests for the request-scoped i18n module.
 *
 * `negotiateLocale` is a pure function over a client-supplied header, so it is tested directly
 * rather than only through the integration suite — malformed headers are the interesting cases
 * and they are tedious to provoke over HTTP.
 *
 * The ALS behaviour is tested for both directions that matter: inside a scope the ambient `t`
 * must be the scope's, and outside one it must silently be the global instance's. The second is
 * what keeps jobs, workers and migrations working, so a regression there is invisible until
 * something out-of-band starts answering in a raw key.
 */
import {
    createLocaleContext,
    getCurrentLocale,
    getLocaleContext,
    listSupportedLocales,
    loadLocaleResources,
    negotiateLocale,
    readLocaleDictionary,
    resetSupportedLocales,
    runWithLocale,
    t
} from '@core/i18n';
import enTranslation from '../../../src/locales/en.json';
import itTranslation from '../../../src/locales/it.json';

const SUPPORTED = ['en', 'it'];

describe('negotiateLocale', () => {
    it.each([
        ['it', 'it'],
        ['en', 'en'],
        ['IT', 'it'],
        ['it-CH', 'it'],
        ['en-GB', 'en']
    ])('resolves %s to %s', (header, expected) => {
        expect(negotiateLocale(header, SUPPORTED)).toBe(expected);
    });

    it('prefers the highest q-weight over header order', () => {
        expect(negotiateLocale('en;q=0.8,it;q=0.9', SUPPORTED)).toBe('it');
    });

    it('keeps header order when weights tie', () => {
        expect(negotiateLocale('it;q=0.9,en;q=0.9', SUPPORTED)).toBe('it');
    });

    it('skips unsupported languages and takes the next acceptable one', () => {
        expect(negotiateLocale('de,fr;q=0.9,it;q=0.8', SUPPORTED)).toBe('it');
    });

    it('ignores an entry the client explicitly refused with q=0', () => {
        expect(negotiateLocale('it;q=0,en;q=0.5', SUPPORTED)).toBe('en');
    });

    it.each([
        ['no header at all', undefined],
        ['an empty header', ''],
        ['a wildcard', '*'],
        ['only unsupported languages', 'de,fr'],
        ['punctuation soup', ';;;,,,']
    ])('falls back to the fallback locale given %s', (_label, header) => {
        expect(negotiateLocale(header, SUPPORTED)).toBe('en');
    });

    it('honours a language whose weight is unparseable, rather than discarding it', () => {
        expect(negotiateLocale('it;q=banana', SUPPORTED)).toBe('it');
    });

    it('falls back to the first supported locale when the fallback is not supported', () => {
        expect(negotiateLocale('de', ['it', 'es'])).toBe('it');
    });
});

describe('the ambient t', () => {
    it('resolves against the scope’s locale inside a scope', () => {
        runWithLocale('it', () => {
            expect(t('signup.user-field-email-invalid')).toBe(
                itTranslation.signup['user-field-email-invalid']
            );
            expect(getCurrentLocale()).toBe('it');
            expect(getLocaleContext()?.locale).toBe('it');
        });
    });

    it('falls back to the global instance outside any scope', () => {
        expect(getLocaleContext()).toBeUndefined();
        expect(t('signup.user-field-email-invalid')).toBe(
            enTranslation.signup['user-field-email-invalid']
        );
    });

    it('survives awaits, so a thunk deep in a promise chain still sees the scope', async () => {
        const resolved = await runWithLocale('it', async () => {
            await Promise.resolve();
            await new Promise((resolve) => setTimeout(resolve, 1));
            return t('signup.user-field-email-invalid');
        });

        expect(resolved).toBe(itTranslation.signup['user-field-email-invalid']);
    });

    it('keeps two overlapping scopes apart', async () => {
        const [italian, english] = await Promise.all([
            runWithLocale('it', async () => {
                await new Promise((resolve) => setTimeout(resolve, 5));
                return t('signup.user-field-email-invalid');
            }),
            runWithLocale('en', async () => {
                await new Promise((resolve) => setTimeout(resolve, 1));
                return t('signup.user-field-email-invalid');
            })
        ]);

        expect(italian).toBe(itTranslation.signup['user-field-email-invalid']);
        expect(english).toBe(enTranslation.signup['user-field-email-invalid']);
    });

    it('binds a context without mutating the global language', () => {
        const before = getCurrentLocale();
        createLocaleContext('it');
        expect(getCurrentLocale()).toBe(before);
    });
});

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

    it('reads a dictionary off disk', () => {
        expect(readLocaleDictionary('it')).toEqual(itTranslation);
    });

    it('shapes every dictionary for i18next.init', () => {
        expect(loadLocaleResources()).toMatchObject({
            en: { translation: enTranslation },
            it: { translation: itTranslation }
        });
    });
});
