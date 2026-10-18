/**
 * @module
 * The sitemap over HTTP with the real modules registered: the index and the files it names, which
 * products appear, one entry per language with its alternates, `lastmod`, the split at the file
 * limit, and the 404 for a file the index does not list.
 *
 * See: docs/modules/sitemap.md
 */

import { Readable } from 'node:stream';
import { parseSitemap, parseSitemapIndex } from 'sitemap';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { withEnvironmentOverrides } from '@tests/environment';
import { createProduct, readProduct } from '@modules/products/tests/factories';
import { localeService } from '@modules/locales';
import { inventoryService } from '@modules/inventory';
import { givenLocale } from '@modules/locales/tests/factories';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import { enabledModules } from '../../../../modules';

setupTestDb();

beforeEach(() => {
    resetDomainEvents();
    registerModules(enabledModules);
});

/** The frontend origin the test environment points links at. */
const FRONTEND = 'http://localhost:8080';

/** The sitemap file at `path`, parsed as a sitemap (which fails on malformed XML). */
const entriesOf = (path: string) =>
    api()
        .get(path)
        .then((response) => {
            expect(response.status).toBe(200);
            return parseSitemap(Readable.from([response.text]));
        });

/** The addresses the index lists, parsed as a sitemap index. */
const filesOf = () =>
    api()
        .get('/sitemap/index.xml')
        .then((response) => {
            expect(response.status).toBe(200);
            return parseSitemapIndex(Readable.from([response.text]));
        })
        .then((files) => files.map(({ url }) => url));

describe('GET /sitemap/index.xml', () => {
    it('names the pages file first, then one products file per run, as cacheable XML', async () => {
        await createProduct();

        const response = await api().get('/sitemap/index.xml');

        expect(response.headers['content-type']).toMatch(/^application\/xml/);
        expect(response.headers['cache-control']).toBe('public, max-age=3600');
        expect(await filesOf()).toEqual([
            'http://localhost:3000/sitemap/pages.xml',
            'http://localhost:3000/sitemap/products-1.xml'
        ]);
    });

    it('lists no products file when the catalogue is empty', async () => {
        expect(await filesOf()).toEqual(['http://localhost:3000/sitemap/pages.xml']);
    });
});

describe('GET /sitemap/pages.xml', () => {
    it('lists every static page once per active language, with every alternate and x-default', async () => {
        const entries = await entriesOf('/sitemap/pages.xml');
        const urls = entries.map(({ url }) => url);

        expect(urls).toEqual(expect.arrayContaining([`${FRONTEND}/en`, `${FRONTEND}/it`]));
        expect(urls).toEqual(
            expect.arrayContaining([
                `${FRONTEND}/en/about`,
                `${FRONTEND}/it/faq`,
                `${FRONTEND}/en/legal`
            ])
        );
        expect(urls).toHaveLength(16);

        const about = entries.find(({ url }) => url === `${FRONTEND}/it/about`);
        expect(about?.links).toEqual([
            { lang: 'en', url: `${FRONTEND}/en/about` },
            { lang: 'it', url: `${FRONTEND}/it/about` },
            { lang: 'x-default', url: `${FRONTEND}/en/about` }
        ]);
        // Nothing dates a prose page.
        expect(entries.every(({ lastmod }) => lastmod === undefined)).toBe(true);
    });

    it('lists a newly registered active language, and leaves an inactive one out', async () => {
        await localeService.createLanguage({ tag: 'de', name: 'German', nativeName: 'Deutsch' });
        await localeService.createLanguage({
            tag: 'fr',
            name: 'French',
            nativeName: 'Français',
            active: false
        });

        const entries = await entriesOf('/sitemap/pages.xml');
        const urls = entries.map(({ url }) => url);

        expect(urls).toContain(`${FRONTEND}/de/about`);
        expect(urls.some((url) => url.includes('/fr'))).toBe(false);
    });
});

/** The first `lastmod` the products file gives, as a time. */
const lastmodOf = (): Promise<number> =>
    entriesOf('/sitemap/products-1.xml').then(([entry]) => new Date(entry.lastmod!).getTime());

describe('GET /sitemap/products-{page}.xml', () => {
    it('lists a public product once per language, with alternates and its updatedAt as lastmod', async () => {
        const product = await createProduct();
        const id = String(product._id);
        const stored = await readProduct(id);
        const changed = stored?.updatedAt?.toISOString();
        expect(changed).toBeDefined();

        const entries = await entriesOf('/sitemap/products-1.xml');

        expect(entries.map(({ url }) => url)).toEqual([
            `${FRONTEND}/en/products/${id}`,
            `${FRONTEND}/it/products/${id}`
        ]);
        expect(entries.map(({ lastmod }) => lastmod)).toEqual([changed, changed]);
        expect(entries[0].links).toEqual([
            { lang: 'en', url: `${FRONTEND}/en/products/${id}` },
            { lang: 'it', url: `${FRONTEND}/it/products/${id}` },
            { lang: 'x-default', url: `${FRONTEND}/en/products/${id}` }
        ]);
    });

    it('moves lastmod when a translation is edited', async () => {
        const product = await createProduct();
        const before = await lastmodOf();
        // `updatedAt` has millisecond resolution; this keeps the edit from landing in the same one.
        await new Promise((resolve) => setTimeout(resolve, 20));

        await givenLocale('it');
        const edit = await localeService.upsertEntityTranslations('product', String(product._id), {
            it: { fields: { title: 'Un titolo nuovo' } }
        });

        expect(edit.success).toBe(true);
        expect(await lastmodOf()).toBeGreaterThan(before);
    });

    it('leaves lastmod alone when only stock changes', async () => {
        const product = await createProduct();
        const before = await lastmodOf();
        await new Promise((resolve) => setTimeout(resolve, 20));

        await inventoryService.receive(String(product._id), 3);

        expect(await lastmodOf()).toBe(before);
    });

    it('leaves out a hidden product and a soft-deleted one', async () => {
        const listed = await createProduct();
        await createProduct({ active: false });
        await createProduct({ deletedAt: new Date() });

        const entries = await entriesOf('/sitemap/products-1.xml');
        const urls = entries.map(({ url }) => url);

        expect(urls).toEqual([
            `${FRONTEND}/en/products/${String(listed._id)}`,
            `${FRONTEND}/it/products/${String(listed._id)}`
        ]);
    });

    it('splits at the file limit, counting each language, so no file passes it', () =>
        withEnvironmentOverrides({ NODE_SITEMAP_URL_LIMIT: '4' }, async () => {
            // Two languages and four URLs a file: two products to a file, so five products need three.
            const ids = new Set<string>();
            for (let created = 0; created < 5; created += 1) {
                const product = await createProduct();
                ids.add(String(product._id));
            }

            const files = await filesOf();
            const runs = await Promise.all(
                files.slice(1).map((file) => entriesOf(new URL(file).pathname))
            );

            expect(files).toHaveLength(4);
            expect(runs.map((run) => run.length)).toEqual([4, 4, 2]);
            const listed = new Set(runs.flat().map(({ url }) => url.split('/').at(-1)));
            expect(listed).toEqual(ids);
        }));

    it.each(['2', '0', '01', 'abc', '-1'])(
        'answers 404 for a file the index does not list (%s)',
        async (page) => {
            await createProduct();

            const response = await api().get(`/sitemap/products-${page}.xml`);

            expect(response.status).toBe(404);
        }
    );
});
