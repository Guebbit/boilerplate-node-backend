/**
 * The translation port: register/resolve/remove/search, the locale-candidate chain a resolver
 * query walks, and `applyTranslations` — the overlay a read path runs on an already wire-shaped
 * page.
 *
 * Mirrors `overrides.test.ts` in spirit — unregistered has to be a safe, ordinary state, since a
 * unit test that never imports `modules/locales` must not throw resolving a product's title.
 */
import {
    applyTranslations,
    localeCandidatesFor,
    planTranslations,
    readAllTranslations,
    registerTranslationPort,
    removeTranslations,
    resolveTranslations,
    runWithLocale,
    searchTranslatedEntityIds,
    writeTranslations,
    type TranslationPort
} from '@infrastructure/i18n';

const ORIGINAL_FALLBACK = process.env.NODE_FALLBACK_LOCALE;

/** A port double whose methods are jest mocks by default, overridable per test. */
const fakePort = (overrides: Partial<TranslationPort> = {}): TranslationPort => ({
    resolve: jest.fn().mockResolvedValue(new Map()),
    removeAll: jest.fn().mockResolvedValue(0),
    search: jest.fn().mockResolvedValue([]),
    plan: jest.fn().mockResolvedValue({ fallbackLocale: 'en', planned: [] }),
    write: jest.fn().mockResolvedValue(undefined),
    readAll: jest.fn().mockResolvedValue(new Map()),
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

describe('searchTranslatedEntityIds', () => {
    it('resolves to an empty list when no port is registered', async () => {
        await expect(
            searchTranslatedEntityIds('product', ['title'], 'bed', ['en'])
        ).resolves.toEqual([]);
    });

    it('delegates to the registered port with exactly what it was given', async () => {
        const port = fakePort({ search: jest.fn().mockResolvedValue(['p1', 'p2']) });
        registerTranslationPort(port);

        const result = await searchTranslatedEntityIds(
            'product',
            ['title', 'description'],
            'cuccia',
            ['it', 'en']
        );

        expect(port.search).toHaveBeenCalledWith('product', ['title', 'description'], 'cuccia', [
            'it',
            'en'
        ]);
        expect(result).toEqual(['p1', 'p2']);
    });
});

describe('planTranslations', () => {
    it('fails rather than pretending to validate when no port is registered', async () => {
        const result = await planTranslations('product', {});

        expect('success' in result && !result.success).toBe(true);
    });

    it('delegates to the registered port with exactly what it was given', async () => {
        const plan = { fallbackLocale: 'en', planned: [] };
        const port = fakePort({ plan: jest.fn().mockResolvedValue(plan) });
        registerTranslationPort(port);

        const payload = { it: { fields: { title: 'Cuccia' } } };
        const result = await planTranslations('product', payload);

        expect(port.plan).toHaveBeenCalledWith('product', payload);
        expect(result).toBe(plan);
    });
});

describe('writeTranslations', () => {
    it('resolves without writing anything when no port is registered', async () => {
        await expect(
            writeTranslations('product', 'p1', { fallbackLocale: 'en', planned: [] }, undefined)
        ).resolves.toBeUndefined();
    });

    it('delegates to the registered port with exactly what it was given', async () => {
        const write = jest.fn().mockResolvedValue(undefined);
        const port = fakePort({ write });
        registerTranslationPort(port);

        const plan = {
            fallbackLocale: 'en',
            planned: [{ locale: 'en', kind: 'upsert' as const, fields: { title: 'Bed' } }]
        };
        await writeTranslations('product', 'p1', plan, 'translator-1');

        expect(write).toHaveBeenCalledWith('product', 'p1', plan, 'translator-1');
    });
});

describe('readAllTranslations', () => {
    it('resolves to an empty map when no port is registered', async () => {
        await expect(readAllTranslations('product', 'p1')).resolves.toEqual(new Map());
    });

    it('delegates to the registered port and returns its map', async () => {
        const rows = new Map([
            ['en', { title: 'Bed' }],
            ['it', { title: 'Cuccia' }]
        ]);
        const port = fakePort({ readAll: jest.fn().mockResolvedValue(rows) });
        registerTranslationPort(port);

        await expect(readAllTranslations('product', 'p1')).resolves.toBe(rows);
        expect(port.readAll).toHaveBeenCalledWith('product', 'p1');
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

describe('applyTranslations', () => {
    it('returns the items unchanged when the batch is empty', async () => {
        await expect(applyTranslations('product', [])).resolves.toEqual([]);
    });

    it('returns the items unchanged when nothing is registered', async () => {
        const items = [{ id: 'p1', title: 'Bed' }];

        await expect(applyTranslations('product', items)).resolves.toEqual(items);
    });

    it('overlays a resolved field onto its matching item, by id', async () => {
        registerTranslationPort(
            fakePort({ resolve: () => Promise.resolve(new Map([['p1', { title: 'Cuccia' }]])) })
        );
        const items = [
            { id: 'p1', title: 'Bed' },
            { id: 'p2', title: 'Bowl' }
        ];

        const result = await runWithLocale('it', () => applyTranslations('product', items));

        expect(result).toEqual([
            { id: 'p1', title: 'Cuccia' },
            { id: 'p2', title: 'Bowl' }
        ]);
    });

    it('leaves an item with no matching row unchanged, by reference', async () => {
        registerTranslationPort(fakePort({ resolve: () => Promise.resolve(new Map()) }));
        const item = { id: 'p1', title: 'Bed' };

        const [result] = await applyTranslations('product', [item]);

        expect(result).toBe(item);
    });

    it('resolves against the ambient locale, base and fallback', async () => {
        process.env.NODE_FALLBACK_LOCALE = 'en';
        const resolve = jest.fn().mockResolvedValue(new Map());
        registerTranslationPort(fakePort({ resolve }));

        await runWithLocale('it-CH', () => applyTranslations('product', [{ id: 'p1' }]));

        expect(resolve).toHaveBeenCalledWith('product', ['p1'], ['it-CH', 'it', 'en']);
    });
});
