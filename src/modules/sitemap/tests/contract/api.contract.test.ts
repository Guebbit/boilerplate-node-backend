/**
 * @module
 * Contract tests for /sitemap. The files are XML, so the spec checks the status, the media type
 * and the headers it declares; what is INSIDE a file (entries, alternates, `lastmod`, the split at
 * the file limit) is `tests/integration/sitemap.test.ts`'s business.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';

setupTestDb();

describe('GET /sitemap/index.xml', () => {
    it('matches the contract: cacheable XML', async () => {
        const response = await api().get('/sitemap/index.xml');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/^application\/xml/);
        expect(response.headers['cache-control']).toBe('public, max-age=3600');
    });
});

describe('GET /sitemap/pages.xml', () => {
    it('matches the contract: cacheable XML', async () => {
        const response = await api().get('/sitemap/pages.xml');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/^application\/xml/);
        expect(response.headers['cache-control']).toBe('public, max-age=3600');
    });
});

describe('GET /sitemap/products-{page}.xml', () => {
    it('matches the contract for a run the index lists', async () => {
        await createProduct();

        const response = await api().get('/sitemap/products-1.xml');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/^application\/xml/);
        expect(response.headers['cache-control']).toBe('public, max-age=3600');
    });

    it('matches the error contract for a run the index does not list', async () => {
        const response = await api().get('/sitemap/products-99.xml');

        expect(response.status).toBe(404);
    });
});
