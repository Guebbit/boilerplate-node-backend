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
import i18next from 'i18next';
import {
    createLocaleContext,
    getCurrentLocale,
    getLocaleContext,
    listSupportedLocales,
    loadLocaleResources,
    negotiateLocale,
    readLocaleDictionary,
    refreshLocaleOverrides,
    registerLocaleOverrideProvider,
    resetLocaleOverrides,
    resetSupportedLocales,
    runWithLocale,
    t
} from '@infrastructure/i18n';
import enTranslation from '../../../src/locales/en.json';
import enUsers from '@modules/users/locales/en.json';
import itTranslation from '../../../src/locales/it.json';
import itUsers from '@modules/users/locales/it.json';

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
            expect(t('users.field-email-invalid')).toBe(itUsers.users['field-email-invalid']);
            expect(getCurrentLocale()).toBe('it');
            expect(getLocaleContext()?.locale).toBe('it');
        });
    });

    it('falls back to the global instance outside any scope', () => {
        expect(getLocaleContext()).toBeUndefined();
        expect(t('users.field-email-invalid')).toBe(enUsers.users['field-email-invalid']);
    });

    it('survives awaits, so a thunk deep in a promise chain still sees the scope', async () => {
        const resolved = await runWithLocale('it', async () => {
            await Promise.resolve();
            // A real task hop, not a wall-clock wait: `setImmediate` crosses the same async
            // boundary a timer would — which is what the store has to survive — without asking
            // the test to guess how long a loaded machine needs.
            await new Promise((resolve) => setImmediate(resolve));
            return t('users.field-email-invalid');
        });

        expect(resolved).toBe(itUsers.users['field-email-invalid']);
    });

    it('keeps two overlapping scopes apart', async () => {
        const [italian, english] = await Promise.all([
            runWithLocale('it', async () => {
                // Two task hops against one, so the scopes genuinely interleave — see the note
                // on the previous test for why these are not timers.
                await new Promise((resolve) => setImmediate(resolve));
                await new Promise((resolve) => setImmediate(resolve));
                return t('users.field-email-invalid');
            }),
            runWithLocale('en', async () => {
                await new Promise((resolve) => setImmediate(resolve));
                return t('users.field-email-invalid');
            })
        ]);

        expect(italian).toBe(itUsers.users['field-email-invalid']);
        expect(english).toBe(enUsers.users['field-email-invalid']);
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

    it('reads a dictionary off disk, merged with every registered module', () => {
        const italian = readLocaleDictionary('it');

        // The shared half is carried through verbatim...
        expect(italian).toMatchObject(itTranslation);
        // ...and the modules layer their own namespaces on top. `users` is asserted rather than
        // just "something was added", so a merge that silently dropped a contribution fails.
        expect(italian['users']).toMatchObject(itUsers.users);
    });

    it('shapes every dictionary for i18next.init', () => {
        expect(loadLocaleResources()).toMatchObject({
            en: { translation: enTranslation },
            it: { translation: itTranslation }
        });
    });
});

/**
 * The override overlay.
 *
 * Three properties, and they are the three this layer was most at risk of quietly losing when it
 * was added on top of a module built around never touching the request path:
 *
 *   the files still stand alone — no provider, or one that throws, must be indistinguishable from
 *   the deployment that existed before overrides did;
 *   overrides do not accumulate — a deleted row must actually stop answering, which only works
 *   because a refresh restores the baseline before re-applying;
 *   a language with no deployed file is skipped — the supported list is what the middleware
 *   negotiates against, and answering `Content-Language: pt` while resolving English is worse
 *   than not offering Portuguese at all.
 *
 * `i18next` is initialised per test rather than shared: `addResourceBundle` mutates a global, and
 * a leaked override would make whichever test ran next depend on order.
 */
describe('locale overrides', () => {
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

    it('resolves from the deployed files when no provider is registered', async () => {
        await refreshLocaleOverrides();

        expect(t('generic.error-unauthorized')).toBe(enTranslation.generic['error-unauthorized']);
    });

    it('lets a stored override win over the deployed file', async () => {
        registerLocaleOverrideProvider(() =>
            Promise.resolve({ en: { generic: { 'error-unauthorized': 'Edited by a human' } } })
        );

        await refreshLocaleOverrides();

        expect(t('generic.error-unauthorized')).toBe('Edited by a human');
    });

    /**
     * The deep-merge half. An override names one leaf, and its siblings have to survive — a
     * shallow bundle would drop every other `generic.*` key and the damage would surface on an
     * unrelated response.
     */
    it('keeps the sibling keys of an overridden one', async () => {
        registerLocaleOverrideProvider(() =>
            Promise.resolve({ en: { generic: { 'error-unauthorized': 'Edited' } } })
        );

        await refreshLocaleOverrides();

        expect(t('generic.error-internal')).toBe(enTranslation.generic['error-internal']);
    });

    /**
     * The reason a refresh restores the baseline first. Without it a deleted row would keep
     * answering until the process restarted — which looks exactly like the delete not saving.
     */
    it('drops an override that has since been deleted', async () => {
        registerLocaleOverrideProvider(() =>
            Promise.resolve({ en: { generic: { 'error-unauthorized': 'Edited' } } })
        );
        await refreshLocaleOverrides();

        registerLocaleOverrideProvider(() => Promise.resolve({}));
        await refreshLocaleOverrides();

        expect(t('generic.error-unauthorized')).toBe(enTranslation.generic['error-unauthorized']);
    });

    /**
     * Stale copy beats copy that reverts itself every time Mongo hiccups: a failed refresh keeps
     * the last good overlay rather than falling back to the files.
     */
    it('keeps the last good overlay when the provider fails', async () => {
        registerLocaleOverrideProvider(() =>
            Promise.resolve({ en: { generic: { 'error-unauthorized': 'Edited' } } })
        );
        await refreshLocaleOverrides();

        registerLocaleOverrideProvider(() => Promise.reject(new Error('mongo is down')));
        await expect(refreshLocaleOverrides()).resolves.toBeUndefined();

        expect(t('generic.error-unauthorized')).toBe('Edited');
    });

    it('ignores overrides for a language with no deployed dictionary', async () => {
        registerLocaleOverrideProvider(() =>
            Promise.resolve({ pt: { generic: { 'error-unauthorized': 'Editado' } } })
        );

        await expect(refreshLocaleOverrides()).resolves.toBeUndefined();
        expect(i18next.getResourceBundle('pt', 'translation')).toBeUndefined();
    });

    it('overrides one language without touching another', async () => {
        registerLocaleOverrideProvider(() =>
            Promise.resolve({ it: { generic: { 'error-unauthorized': 'Modificato' } } })
        );

        await refreshLocaleOverrides();

        expect(i18next.getFixedT('it')('generic.error-unauthorized')).toBe('Modificato');
        expect(i18next.getFixedT('en')('generic.error-unauthorized')).toBe(
            enTranslation.generic['error-unauthorized']
        );
    });
});
