/**
 * An admin edit must reach the next anonymous reader.
 *
 * The public dictionary is cached for an hour, so every write route in `src/modules/locales` wraps
 * in `invalidateCache(['locales'])`. That is two declarations a segment apart — the tag the READ
 * stores its response under, and the tag the WRITE clears — and nothing type-checks them against
 * each other. Get one wrong and the feature looks perfect in development, where the TTL is clamped
 * to thirty seconds and every manual check is a fresh miss, and silently serves an hour-old
 * translation in production.
 *
 * So this drives the real app end to end and asserts the CACHED RESPONSE actually disappears,
 * rather than asserting that `invalidateCacheTags` was called with a string.
 *
 * ## Why the cache adapter is a double rather than a live Redis
 *
 * `getCacheValue` resolves `undefined` on any failure, so on a machine with no Redis every request
 * is a miss and a test written against the real adapter would pass while proving nothing — the
 * worst possible outcome for a test about caching. The double below implements the same two-family
 * semantics the Redis adapter does (a key per response, a set per tag) in a Map, which is exactly
 * the part being asserted: that the key the write clears is the key the read wrote.
 *
 * `resolveCacheTtl` is deliberately NOT doubled. It is what decides whether anything is cached at
 * all outside production, and stubbing it would let this suite pass against a configuration where
 * the middleware caches nothing.
 */

jest.mock('@infrastructure/adapters/cache', () => {
    const actual = jest.requireActual('@infrastructure/adapters/cache');

    const responses = new Map<string, unknown>();
    const tagged = new Map<string, Set<string>>();

    return {
        ...actual,
        getCacheValue: (key: string) => Promise.resolve(responses.get(key)),
        setCacheValue: (key: string, value: unknown, ttlSeconds: number, tags: string[] = []) => {
            // The real adapter's guard: a non-positive TTL means "do not cache this at all".
            if (ttlSeconds <= 0) return Promise.resolve();

            responses.set(key, value);
            for (const tag of tags) {
                const members = tagged.get(tag) ?? new Set<string>();
                members.add(key);
                tagged.set(tag, members);
            }
            return Promise.resolve();
        },
        invalidateCacheTags: (tags: string[]) => {
            for (const tag of tags) {
                for (const key of tagged.get(tag) ?? []) responses.delete(key);
                tagged.delete(tag);
            }
            return Promise.resolve();
        }
    };
});

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';

setupTestDb();

/** Registers a language and one key through the real admin routes. */
const givenPublishedLanguage = async (bearer: string) => {
    await api()
        .post('/locales')
        .set('Authorization', bearer)
        .send({ tag: 'pt', name: 'Portuguese', nativeName: 'Português' });

    await api()
        .post('/locales/pt/entries')
        .set('Authorization', bearer)
        // `app`: the client's dictionary, which is the half `GET /locales/:locale/messages`
        // serves and therefore the half whose cached copy this test is about.
        .send({ scope: 'app', key: 'cart.title', value: 'Carrinho' });
};

describe('an admin write invalidates the cached public dictionary', () => {
    it('serves a second identical read from cache, then re-renders it after an edit', async () => {
        const { bearer } = await authenticateAs('admin');
        await givenPublishedLanguage(bearer);

        // First read renders from Mongo and stores the response under the `locales` tag.
        const first = await api().get('/locales/pt/messages');
        expect(first.headers['x-cache']).toBe('MISS');
        expect(first.body.data.messages).toEqual({ cart: { title: 'Carrinho' } });

        /*
         * Second read is served from the store. Asserted explicitly, because it is what makes the
         * third read meaningful: without a proven HIT here, a MISS below would prove nothing.
         */
        const cached = await api().get('/locales/pt/messages');
        expect(cached.headers['x-cache']).toBe('HIT');

        const listed = await api().get('/locales/pt/entries').set('Authorization', bearer);
        const entryId = listed.body.data.items[0].id;

        await api()
            .put(`/locales/pt/entries/${entryId}`)
            .set('Authorization', bearer)
            .send({ value: 'O seu carrinho' });

        // The stored response is gone, so the next anonymous reader gets the edit rather than the
        // hour-old copy.
        const afterEdit = await api().get('/locales/pt/messages');
        expect(afterEdit.headers['x-cache']).toBe('MISS');
        expect(afterEdit.body.data.messages).toEqual({ cart: { title: 'O seu carrinho' } });
    });

    it('clears the manifest too, so a new language is visible immediately', async () => {
        // Both public reads carry the same tag, and a client discovering languages through a stale
        // manifest cannot ask for the one that was just added — the dictionary being current would
        // not help it.
        const { bearer } = await authenticateAs('admin');

        await api().get('/locales');
        const cached = await api().get('/locales');
        expect(cached.headers['x-cache']).toBe('HIT');

        await api()
            .post('/locales')
            .set('Authorization', bearer)
            .send({ tag: 'pt', name: 'Portuguese', nativeName: 'Português' });

        const afterCreate = await api().get('/locales');

        expect(afterCreate.headers['x-cache']).toBe('MISS');
        expect(afterCreate.body.data.locales.some(({ tag }: { tag: string }) => tag === 'pt')).toBe(
            true
        );
    });

    it('does not clear the cache when the write was refused', async () => {
        // `invalidateCache` only fires on a 2xx. A failed write that dropped every cached locale
        // response would turn a mistyped request into a cache stampede.
        const { bearer } = await authenticateAs('admin');
        await givenPublishedLanguage(bearer);

        await api().get('/locales/pt/messages');

        // 409 — the language is still active, so the delete is refused.
        const refused = await api().delete('/locales/pt').set('Authorization', bearer);
        expect(refused.status).toBe(409);

        const stillCached = await api().get('/locales/pt/messages');
        expect(stillCached.headers['x-cache']).toBe('HIT');
    });
});
