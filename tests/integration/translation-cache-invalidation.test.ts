/**
 * A translation write must reach the next anonymous reader of the product it translated.
 *
 * `GET /products/:id` is cached under the `products` tag for an hour
 * (`src/modules/products/routes.ts`); `PATCH /locales/translations/product/:id` clears that same
 * tag through the registry-declared `cacheTag`, from a module that never imports `products` at
 * all. Nothing type-checks the two tags against each other, so this drives the real app end to
 * end and asserts the CACHED RESPONSE actually disappears — the same shape
 * `locale-cache-invalidation.test.ts` uses for the tier-1 dictionary, and for the same reason: a
 * unit test asserting `invalidateCacheTags` was called with a string would pass against a typo.
 */

jest.mock('@infrastructure/adapters/cache', () => {
    const actual = jest.requireActual('@infrastructure/adapters/cache');

    const responses = new Map<string, string>();
    const tagged = new Map<string, Set<string>>();

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
        invalidateCacheTags: (tags: string[]) => {
            let deleted = 0;
            for (const tag of tags) {
                for (const key of tagged.get(tag) ?? []) {
                    responses.delete(key);
                    deleted += 1;
                }
                tagged.delete(tag);
            }
            return Promise.resolve({ deleted, reachable: true });
        }
    };
});

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { localeRepository } from '@modules/locales/repository';
import { makeLocale } from '@modules/locales/factories';

setupTestDb();

/** `en` is the fallback locale in every environment this suite runs in — see `.env-example`. */
const FALLBACK = 'en';

describe('a translation write invalidates the cached product it translated', () => {
    it('serves a second identical read from cache, then re-renders it after a PATCH', async () => {
        await localeRepository.create(
            makeLocale({ tag: FALLBACK, name: 'English', nativeName: 'English' })
        );
        const product = await createProduct({ title: 'Old title' });
        const id = String(product._id);
        const { bearer } = await authenticateAs('owner');

        const first = await api().get(`/products/${id}`);
        expect(first.headers['x-cache']).toBe('MISS');
        expect(first.body.data.title).toBe('Old title');

        const cached = await api().get(`/products/${id}`);
        expect(cached.headers['x-cache']).toBe('HIT');

        await api()
            .patch(`/locales/translations/product/${id}`)
            .set('Authorization', bearer)
            .send({ [FALLBACK]: { fields: { title: 'New title' } } });

        const afterPatch = await api().get(`/products/${id}`);
        expect(afterPatch.headers['x-cache']).toBe('MISS');
        expect(afterPatch.body.data.title).toBe('New title');
    });

    it('does not clear the cache when the write was refused', async () => {
        await localeRepository.create(
            makeLocale({ tag: FALLBACK, name: 'English', nativeName: 'English' })
        );
        const product = await createProduct({ title: 'Untouched' });
        const id = String(product._id);
        const { bearer } = await authenticateAs('owner');

        await api().get(`/products/${id}`);

        // 422 — `xx` is not a locale this deployment knows.
        const refused = await api()
            .patch(`/locales/translations/product/${id}`)
            .set('Authorization', bearer)
            .send({ xx: { fields: { title: 'Nope' } } });
        expect(refused.status).toBe(422);

        const stillCached = await api().get(`/products/${id}`);
        expect(stillCached.headers['x-cache']).toBe('HIT');
    });
});
