/**
 * An admin edit must reach the next anonymous reader.
 *
 * Risk:    the public dictionary is cached for an hour, so every write route in
 *          `src/modules/locales` clears the tags of the language it changed (`locale:<code>`) and
 *          the manifest (`locales:manifest`). The tag the READ stores
 *          under and the tag the WRITE clears are two declarations nothing type-checks against each
 *          other. A mismatch looks perfect in development (TTL clamped to thirty seconds, every
 *          manual check a fresh miss) and serves an hour-old translation in production.
 * Asserts: the real app end to end; the CACHED RESPONSE disappears, not that
 *          `invalidateCacheTags` got a string.
 * Double:  the cache adapter, not a live Redis. `getCacheValue` resolves `undefined` on any
 *          failure, so with no Redis every request misses and a test on the real adapter passes
 *          proving nothing. The double keeps the Redis adapter's two-family semantics (a key per
 *          response, a set per tag) in a Map: the part under test is that the key the write clears
 *          is the key the read wrote.
 * Real:    everything else, deliberately. The TTL clamp and stored envelope in
 *          `http/middlewares/cache.ts` run for real: the clamp decides whether anything is cached
 *          outside production, and stubbing it would pass against a middleware that caches nothing.
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
        /**
         * The real adapter reports whether the cache was reached, so the middleware can count
         * a write whose stale response survived it. This fake always reaches.
         */
        return Promise.resolve({ deleted, reachable: true });
    };

    return {
        ...actual,
        getCacheValue: (key: string) => Promise.resolve(responses.get(key)),
        setCacheValue: (key: string, value: string, ttlSeconds: number, tags: string[] = []) => {
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
        invalidateCacheTags,
        /**
         * The real `invalidateCacheTagsLogged` calls `invalidateCacheTags` through its own
         * module-local binding, which `jest.requireActual` captures before this factory ever
         * runs — so overriding the export above does not reach it. Redeclared here against the
         * same double, or every write "succeeds" against the real (unreachable) Redis instead.
         */
        invalidateCacheTagsLogged: (tags: string[]) =>
            invalidateCacheTags(tags).then(() => undefined)
    };
});

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { setEnvironment } from '@tests/environment';

setupTestDb();

/** Registers a language and one key through the real admin routes. */
const givenPublishedLanguage = async (bearer: string) => {
    await api()
        .post('/locales')
        .set('Authorization', bearer)
        .send({ tag: 'pt', name: 'Portuguese', nativeName: 'Português' });

    await api()
        /**
         * `demo-fe`: the frontend app, which is the half `GET /locales/:locale/messages`
         * serves and therefore the half whose cached copy this test is about.
         */
        .post('/locales/pt/apps/demo-fe/entries')
        .set('Authorization', bearer)
        .send({ key: 'cart.title', value: 'Carrinho' });
};

describe('an admin write invalidates the cached public dictionary', () => {
    it('serves a second identical read from cache, then re-renders it after an edit', async () => {
        const { bearer } = await authenticateAs('admin');
        await givenPublishedLanguage(bearer);

        // First read renders from Mongo and stores the response under the `locale:pt` tag.
        const first = await api().get('/locales/pt/messages');
        expect(first.headers['cache-status']).toContain('fwd=miss');
        expect(first.body.messages).toEqual({ cart: { title: 'Carrinho' } });

        /**
         * Second read is served from the store. Asserted explicitly, because it is what makes the
         * third read meaningful: without a proven HIT here, a MISS below would prove nothing.
         */
        const cached = await api().get('/locales/pt/messages');
        expect(cached.headers['cache-status']).toMatch(/; hit; ttl=\d+/);

        const listed = await api().get('/locales/pt/entries').set('Authorization', bearer);
        const entryId = listed.body.items[0].id;

        await api()
            .put(`/locales/pt/apps/demo-fe/entries/${entryId}`)
            .set('Authorization', bearer)
            .send({ value: 'O seu carrinho' });

        /**
         * The stored response is gone, so the next anonymous reader gets the edit rather than the
         * hour-old copy.
         */
        const afterEdit = await api().get('/locales/pt/messages');
        expect(afterEdit.headers['cache-status']).toContain('fwd=miss');
        expect(afterEdit.body.messages).toEqual({ cart: { title: 'O seu carrinho' } });
    });

    it('clears the manifest too, so a new language is visible immediately', async () => {
        /**
         * Both public reads carry the same tag, and a client discovering languages through a stale
         * manifest cannot ask for the one that was just added — the dictionary being current would
         * not help it.
         */
        const { bearer } = await authenticateAs('admin');

        await api().get('/locales');
        const cached = await api().get('/locales');
        expect(cached.headers['cache-status']).toMatch(/; hit; ttl=\d+/);

        await api()
            .post('/locales')
            .set('Authorization', bearer)
            .send({ tag: 'pt', name: 'Portuguese', nativeName: 'Português' });

        const afterCreate = await api().get('/locales');

        expect(afterCreate.headers['cache-status']).toContain('fwd=miss');
        expect(afterCreate.body.locales.some(({ tag }: { tag: string }) => tag === 'pt')).toBe(
            true
        );
    });
});

/** The `Cache-Status` of an anonymous read: a hit, or the miss that rebuilt it. */
const cacheStatusOf = (path: string) =>
    api()
        .get(path)
        .then((response) => response.headers['cache-status']);

describe('an edit clears only its own language', () => {
    it("leaves another language's cached dictionary and row alone, and clears the manifest", async () => {
        const { bearer } = await authenticateAs('admin');
        await givenPublishedLanguage(bearer);
        // A second registered language, whose reads must outlive an edit to `pt`.
        await api()
            .post('/locales')
            .set('Authorization', bearer)
            .send({ tag: 'es', name: 'Spanish', nativeName: 'Español' });

        for (const path of ['/locales/es/messages', '/locales/es', '/locales/pt', '/locales'])
            await api().get(path);

        await api()
            .post('/locales/pt/apps/demo-fe/entries')
            .set('Authorization', bearer)
            .send({ key: 'cart.total', value: 'Total' });

        expect(await cacheStatusOf('/locales/es/messages')).toMatch(/; hit; ttl=\d+/);
        expect(await cacheStatusOf('/locales/es')).toMatch(/; hit; ttl=\d+/);
        expect(await cacheStatusOf('/locales/pt')).toContain('fwd=miss');
        expect(await cacheStatusOf('/locales')).toContain('fwd=miss');
    });

    it('files a path spelt in another case under the same language', async () => {
        const { bearer } = await authenticateAs('admin');
        await givenPublishedLanguage(bearer);
        await api().get('/locales/PT/messages');
        const warm = await api().get('/locales/PT/messages');
        expect(warm.headers['cache-status']).toMatch(/; hit; ttl=\d+/);

        await api()
            .post('/locales/pt/apps/demo-fe/entries')
            .set('Authorization', bearer)
            .send({ key: 'cart.total', value: 'Total' });

        const after = await api().get('/locales/PT/messages');
        expect(after.headers['cache-status']).toContain('fwd=miss');
    });
});

describe('the cached dictionary is per app', () => {
    it("answers ?app=b with b's dictionary after a warm read of a", async () => {
        // A second frontend app, so the query parameter has something to choose between.
        setEnvironment({ NODE_LOCALE_APPS_EXTRA: 'kiosk=Kiosk' });
        const { bearer } = await authenticateAs('admin');
        await givenPublishedLanguage(bearer);
        await api()
            .post('/locales/pt/apps/kiosk/entries')
            .set('Authorization', bearer)
            .send({ key: 'cart.title', value: 'Quiosque' });

        const warm = await api().get('/locales/pt/messages?app=demo-fe');
        expect(warm.body.messages).toEqual({ cart: { title: 'Carrinho' } });
        const again = await api().get('/locales/pt/messages?app=demo-fe');
        expect(again.headers['cache-status']).toMatch(/; hit; ttl=\d+/);

        const other = await api().get('/locales/pt/messages?app=kiosk');

        expect(other.headers['cache-status']).toContain('fwd=miss');
        expect(other.body.messages).toEqual({ cart: { title: 'Quiosque' } });
    });
});

describe('a body on a GET never reaches the cache key', () => {
    it("does not store one app's dictionary under another app's key", async () => {
        setEnvironment({ NODE_LOCALE_APPS_EXTRA: 'kiosk=Kiosk' });
        const { bearer } = await authenticateAs('admin');
        await givenPublishedLanguage(bearer);
        await api()
            .post('/locales/pt/apps/kiosk/entries')
            .set('Authorization', bearer)
            .send({ key: 'cart.title', value: 'Quiosque' });

        // Anonymous: asks for demo-fe in the query, but names kiosk in a body the key must not read.
        const poisoning = await api()
            .get('/locales/pt/messages?app=demo-fe')
            .send({ app: 'kiosk' });
        expect(poisoning.body.messages).toEqual({ cart: { title: 'Carrinho' } });

        const honest = await api().get('/locales/pt/messages?app=kiosk');

        expect(honest.headers['cache-status']).toContain('fwd=miss');
        expect(honest.body.messages).toEqual({ cart: { title: 'Quiosque' } });
    });
});
