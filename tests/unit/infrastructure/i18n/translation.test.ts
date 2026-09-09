/**
 * The translation port: the register/resolve/remove trio, and the locale-candidate chain a
 * resolver query walks.
 *
 * Mirrors `overrides.test.ts` in spirit — unregistered has to be a safe, ordinary state, since a
 * unit test that never imports `modules/locales` must not throw resolving a product's title.
 */
import {
    localeCandidatesFor,
    registerTranslationPort,
    removeTranslations,
    resolveTranslations,
    type TranslationPort
} from '@infrastructure/i18n';

const ORIGINAL_FALLBACK = process.env.NODE_FALLBACK_LOCALE;

/** A port double whose two methods are jest mocks by default, overridable per test. */
const fakePort = (overrides: Partial<TranslationPort> = {}): TranslationPort => ({
    resolve: jest.fn().mockResolvedValue(new Map()),
    removeAll: jest.fn().mockResolvedValue(0),
    ...overrides
});

afterEach(() => {
    registerTranslationPort(undefined);
    if (ORIGINAL_FALLBACK === undefined) delete process.env.NODE_FALLBACK_LOCALE;
    else process.env.NODE_FALLBACK_LOCALE = ORIGINAL_FALLBACK;
});

describe('resolveTranslations', () => {
    it('resolves to an empty map when no port is registered', async () => {
        await expect(resolveTranslations('product', ['p1'], ['en'])).resolves.toEqual(new Map());
    });

    it('resolves to an empty map for an empty batch, without calling the registered port', async () => {
        const port = fakePort();
        registerTranslationPort(port);

        await expect(resolveTranslations('product', [], ['en'])).resolves.toEqual(new Map());
        expect(port.resolve).not.toHaveBeenCalled();
    });

    it('delegates to the registered port with exactly what it was given', async () => {
        const resolved = new Map([['p1', { title: 'Cuccia' }]]);
        const port = fakePort({ resolve: jest.fn().mockResolvedValue(resolved) });
        registerTranslationPort(port);

        const result = await resolveTranslations('product', ['p1', 'p2'], ['it-CH', 'it', 'en']);

        expect(port.resolve).toHaveBeenCalledWith('product', ['p1', 'p2'], ['it-CH', 'it', 'en']);
        expect(result).toBe(resolved);
    });

    it('lets a second registration replace the first, the same way overrides do', async () => {
        registerTranslationPort(
            fakePort({ resolve: () => Promise.resolve(new Map([['p1', { title: 'first' }]])) })
        );
        registerTranslationPort(
            fakePort({ resolve: () => Promise.resolve(new Map([['p1', { title: 'second' }]])) })
        );

        const result = await resolveTranslations('product', ['p1'], ['en']);

        expect(result.get('p1')).toEqual({ title: 'second' });
    });
});

describe('removeTranslations', () => {
    it('resolves to zero removed when no port is registered', async () => {
        await expect(removeTranslations('product', 'p1')).resolves.toBe(0);
    });

    it('delegates to the registered port and returns its count', async () => {
        const port = fakePort({ removeAll: jest.fn().mockResolvedValue(3) });
        registerTranslationPort(port);

        await expect(removeTranslations('product', 'p1')).resolves.toBe(3);
        expect(port.removeAll).toHaveBeenCalledWith('product', 'p1');
    });
});

describe('localeCandidatesFor', () => {
    beforeEach(() => {
        process.env.NODE_FALLBACK_LOCALE = 'en';
    });

    it('builds the exact, base and fallback chain for a region-tagged locale', () => {
        expect(localeCandidatesFor('it-CH')).toEqual(['it-CH', 'it', 'en']);
    });

    it('does not repeat a base tag requested directly', () => {
        expect(localeCandidatesFor('it')).toEqual(['it', 'en']);
    });

    it('does not repeat the fallback when it is itself requested', () => {
        expect(localeCandidatesFor('en')).toEqual(['en']);
    });

    it('does not repeat a region-tagged fallback locale', () => {
        process.env.NODE_FALLBACK_LOCALE = 'pt-BR';

        expect(localeCandidatesFor('pt-BR')).toEqual(['pt-BR', 'pt']);
    });
});
