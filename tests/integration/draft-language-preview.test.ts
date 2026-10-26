/**
 * Staff preview a draft language's product text, and nobody else ever reads it.
 *
 * The trap this file exists for: a credential holding `display:Locale` WITHOUT `display:Product`
 * reads the anonymous catalogue scope, so `scopeKey` says it may share the visitors' Redis entry.
 * The preview must bypass the cache on its own flag, in both directions. Every case drives the
 * real routes against an in-memory Redis double, and the canary proves the double WOULD have
 * shared the entry, so the suite cannot pass vacuously.
 */

jest.mock('@infrastructure/adapters/cache', () => {
    const actual = jest.requireActual('@infrastructure/adapters/cache');
    const responses = new Map<string, string>();
    const tagged = new Map<string, Set<string>>();

    const invalidateCacheTags = (tags: string[]) => {
        let deleted = 0;
        for (const tag of tags) {
            for (const key of tagged.get(tag) ?? []) {
                responses.delete(key);
                deleted += 1;
            }
            tagged.delete(tag);
        }
        return Promise.resolve({ deleted, reachable: true });
    };

    return {
        ...actual,
        getCacheValue: (key: string) => Promise.resolve(responses.get(key)),
        setCacheValue: (key: string, value: string, ttlSeconds: number, tags: string[] = []) => {
            if (ttlSeconds <= 0) return Promise.resolve();
            responses.set(key, value);
            for (const tag of tags) {
                const members = tagged.get(tag) ?? new Set<string>();
                members.add(key);
                tagged.set(tag, members);
            }
            return Promise.resolve();
        },
        invalidateCacheTags,
        invalidateCacheTagsLogged: (tags: string[]) =>
            invalidateCacheTags(tags).then(() => undefined),
        // Test-only handles on the double: what it holds, and a way to empty it.
        storedValues: () => [...responses.values()],
        clearStored: () => {
            responses.clear();
            tagged.clear();
        }
    };
});

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { credentialHolding } from '@tests/credentials';
import { createProduct } from '@modules/products/tests/factories';
import { translationRepository } from '@modules/locales/repository';
import { givenLocale } from '@modules/locales/tests/factories';
import { localeService } from '@modules/locales/services';
import {
    refreshLocaleOverrides,
    registerLocaleOverrideProvider,
    resetLocaleOverrides
} from '@infrastructure/i18n';

setupTestDb();

/** The double's test-only handles, declared by the mock factory above. */
const cacheDouble = jest.requireMock<{ storedValues: () => string[]; clearStored: () => void }>(
    '@infrastructure/adapters/cache'
);

beforeAll(() => {
    registerLocaleOverrideProvider(() => localeService.readLocaleOverlay());
});

beforeEach(() => {
    cacheDouble.clearStored();
});

afterEach(() => {
    resetLocaleOverrides();
});

afterAll(() => {
    registerLocaleOverrideProvider(undefined);
});

/** The title only a previewing editor may read. */
const DRAFT_TITLE = 'Hundekorb';

/** The title every visitor reads. */
const LIVE_TITLE = 'Dog basket';

/**
 * A product titled in the fallback language with a DRAFT German row, German switched off.
 *
 * @param fields - the draft row's fields, the title only when omitted
 * @returns the product id
 */
const givenDraftGerman = async (fields?: Record<string, string>) => {
    await givenLocale('en');
    await givenLocale('de', { active: false });
    const product = await createProduct({ title: LIVE_TITLE, description: 'Soft bed' });
    const id = String(product._id);
    await translationRepository.upsertEntityLocale(
        'product',
        id,
        'de',
        fields ?? { title: DRAFT_TITLE },
        'human',
        undefined,
        'digest'
    );
    await refreshLocaleOverrides();
    return id;
};

/** A request header set for a caller and a language. */
const asking = (language: string, bearer?: string): Record<string, string> => ({
    'Accept-Language': language,
    ...(bearer ? { Authorization: bearer } : {})
});

/** The three catalogue reads, each answering the product's title from its own body shape. */
const READS = [
    {
        name: 'GET /products',
        read: (_id: string, headers: Record<string, string>) => api().get('/products').set(headers),
        titleOf: (body: { items: { title: string }[] }) => body.items[0]?.title
    },
    {
        name: 'POST /products/search',
        read: (_id: string, headers: Record<string, string>) =>
            api().post('/products/search').set(headers).send({}),
        titleOf: (body: { items: { title: string }[] }) => body.items[0]?.title
    },
    {
        name: 'GET /products/:id',
        read: (id: string, headers: Record<string, string>) =>
            api().get(`/products/${id}`).set(headers),
        titleOf: (body: { title: string }) => body.title
    }
] as const;

describe('a staff credential that holds display:Locale and nothing else', () => {
    it('canary: shares the visitors cache entry in a live language, so the suite is not vacuous', async () => {
        const id = await givenDraftGerman();
        const key = `Bearer ${await credentialHolding(['display:Locale'])}`;

        const visitor = await api().get(`/products/${id}`).set(asking('en'));
        const staff = await api().get(`/products/${id}`).set(asking('en', key));

        expect(visitor.headers['x-cache']).toBe('MISS');
        expect(staff.headers['x-cache']).toBe('HIT');
    });

    it.each(READS)(
        '$name: reads the draft uncached and leaves the visitors entry alone',
        async ({ read, titleOf }) => {
            const id = await givenDraftGerman();
            const key = `Bearer ${await credentialHolding(['display:Locale'])}`;

            const visitor = await read(id, asking('de'));
            const preview = await read(id, asking('de', key));
            const visitorAgain = await read(id, asking('de'));

            expect(titleOf(visitor.body)).toBe(LIVE_TITLE);
            expect(visitor.headers['x-cache']).toBe('MISS');

            expect(titleOf(preview.body)).toBe(DRAFT_TITLE);
            expect(preview.headers['content-language']).toBe('de');
            expect(preview.headers['cache-control']).toBe('private, no-store');
            expect(preview.headers['x-cache']).toBeUndefined();

            expect(titleOf(visitorAgain.body)).toBe(LIVE_TITLE);
            expect(visitorAgain.headers['x-cache']).toBe('HIT');
            expect(cacheDouble.storedValues().join('\n')).not.toContain(DRAFT_TITLE);
        }
    );

    it('cold cache: previewing first stores nothing, so the first visitor still gets a MISS', async () => {
        const id = await givenDraftGerman();
        const key = `Bearer ${await credentialHolding(['display:Locale'])}`;

        await api().get(`/products/${id}`).set(asking('de', key));
        const visitor = await api().get(`/products/${id}`).set(asking('de'));

        expect(cacheDouble.storedValues().join('\n')).not.toContain(DRAFT_TITLE);
        expect(visitor.headers['x-cache']).toBe('MISS');
        expect(visitor.body.title).toBe(LIVE_TITLE);
    });

    it('answers a field the draft lacks from the live chain, field by field', async () => {
        const id = await givenDraftGerman({ title: DRAFT_TITLE });
        const key = `Bearer ${await credentialHolding(['display:Locale'])}`;

        const preview = await api().get(`/products/${id}`).set(asking('de', key));

        expect(preview.body.title).toBe(DRAFT_TITLE);
        expect(preview.body.description).toBe('Soft bed');
    });

    it('is told nothing by a conditional request: a 200 with a body, never a 304', async () => {
        const id = await givenDraftGerman();
        const key = `Bearer ${await credentialHolding(['display:Locale'])}`;
        const first = await api().get(`/products/${id}`).set(asking('de', key));

        const again = await api()
            .get(`/products/${id}`)
            .set({ ...asking('de', key), 'If-None-Match': first.headers.etag });

        expect(again.status).toBe(200);
        expect(again.body.title).toBe(DRAFT_TITLE);
    });

    it('finds a product by a word that only the draft text holds, and a visitor does not', async () => {
        await givenDraftGerman({ title: 'Hundekorb', description: 'Zauberwort' });
        const key = `Bearer ${await credentialHolding(['display:Locale'])}`;

        const staff = await api().get('/products?text=Zauberwort').set(asking('de', key));
        const visitor = await api().get('/products?text=Zauberwort').set(asking('de'));

        expect(staff.body.items).toHaveLength(1);
        expect(visitor.body.items).toHaveLength(0);
    });

    it('lists in the live language when the draft is not the first choice', async () => {
        const id = await givenDraftGerman();
        const key = `Bearer ${await credentialHolding(['display:Locale'])}`;

        const response = await api().get(`/products/${id}`).set(asking('en, de;q=0.5', key));

        expect(response.body.title).toBe(LIVE_TITLE);
        expect(response.headers['content-language']).toBe('en');
        expect(response.headers['cache-control']).not.toContain('no-store');
    });
});

describe('everyone else asking for the draft', () => {
    it('gets the live pick, a 200, and the shared cache: an anonymous visitor', async () => {
        const id = await givenDraftGerman();

        const response = await api().get(`/products/${id}`).set(asking('de'));

        expect(response.status).toBe(200);
        expect(response.body.title).toBe(LIVE_TITLE);
        expect(response.headers['content-language']).toBe('en');
        expect(response.headers['x-cache']).toBe('MISS');
    });

    it('gets the live pick too: a customer, who may not read drafts', async () => {
        const id = await givenDraftGerman();
        const { bearer } = await authenticateAsRole('customer');

        const response = await api().get(`/products/${id}`).set(asking('de', bearer));

        expect(response.status).toBe(200);
        expect(response.body.title).toBe(LIVE_TITLE);
        expect(response.headers['content-language']).toBe('en');
    });
});

describe('the oracle', () => {
    it('shows the preview exactly as a visitor reads it once the language is switched on', async () => {
        const id = await givenDraftGerman();
        const key = `Bearer ${await credentialHolding(['display:Locale'])}`;
        const preview = await api().get(`/products/${id}`).set(asking('de', key));
        const { bearer } = await authenticateAs('admin');

        const activated = await api().post('/locales/de/activate').set('Authorization', bearer);
        const visitor = await api().get(`/products/${id}`).set(asking('de'));

        expect(activated.status).toBe(200);
        expect(visitor.body).toEqual(preview.body);
        expect(visitor.headers['content-language']).toBe('de');
    });
});
