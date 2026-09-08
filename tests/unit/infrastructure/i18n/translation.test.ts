/**
 * The translation port: the register/resolve pair, and the locale-candidate chain a resolver
 * query walks.
 *
 * Mirrors `overrides.test.ts` in spirit — unregistered has to be a safe, ordinary state, since a
 * unit test that never imports `modules/locales` must not throw resolving a product's title.
 */
import {
    localeCandidatesFor,
    registerTranslationResolver,
    resolveTranslations
} from '@infrastructure/i18n';

const ORIGINAL_FALLBACK = process.env.NODE_FALLBACK_LOCALE;

afterEach(() => {
    registerTranslationResolver(undefined);
    if (ORIGINAL_FALLBACK === undefined) delete process.env.NODE_FALLBACK_LOCALE;
    else process.env.NODE_FALLBACK_LOCALE = ORIGINAL_FALLBACK;
});

describe('resolveTranslations', () => {
    it('resolves to an empty map when no resolver is registered', async () => {
        await expect(resolveTranslations('product', ['p1'], ['en'])).resolves.toEqual(new Map());
    });

    it('resolves to an empty map for an empty batch, without calling a registered resolver', async () => {
        const resolver = jest.fn();
        registerTranslationResolver(resolver);

        await expect(resolveTranslations('product', [], ['en'])).resolves.toEqual(new Map());
        expect(resolver).not.toHaveBeenCalled();
    });

    it('delegates to the registered resolver with exactly what it was given', async () => {
        const resolved = new Map([['p1', { title: 'Cuccia' }]]);
        const resolver = jest.fn().mockResolvedValue(resolved);
        registerTranslationResolver(resolver);

        const result = await resolveTranslations('product', ['p1', 'p2'], ['it-CH', 'it', 'en']);

        expect(resolver).toHaveBeenCalledWith('product', ['p1', 'p2'], ['it-CH', 'it', 'en']);
        expect(result).toBe(resolved);
    });

    it('lets a second registration replace the first, the same way overrides do', async () => {
        registerTranslationResolver(() => Promise.resolve(new Map([['p1', { title: 'first' }]])));
        registerTranslationResolver(() => Promise.resolve(new Map([['p1', { title: 'second' }]])));

        const result = await resolveTranslations('product', ['p1'], ['en']);

        expect(result.get('p1')).toEqual({ title: 'second' });
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
