/**
 * @module
 * The sitemap's languages follow the `locales` module: a language written through its service, or
 * switched off, changes every address and alternate. Lives here, not in the sitemap module, because
 * it needs `locales` and a strip of that module must not silently delete the sitemap's own tests.
 *
 * @see docs/modules/sitemap.md
 */

import { Readable } from 'node:stream';
import { parseSitemap } from 'sitemap';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { withEnvironmentOverrides } from '@tests/environment';
import { createProduct } from '@modules/products/tests/factories';
import { localeService } from '@modules/locales';
import { givenLocale } from '@modules/locales/tests/factories';
import { refreshLocaleOverrides, resetServedLanguages } from '@infrastructure/i18n';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import { enabledModules } from '../../src/modules';

setupTestDb();

beforeEach(() => {
    // The served-language list is process memory, so the previous case's languages would leak in.
    resetServedLanguages();
    resetDomainEvents();
    registerModules(enabledModules);
});

/**
 * `givenLocale` writes the row only; the served list follows the overlay refresh that a real
 * language write triggers, so it is run here too.
 */
const givenServedLocale = (...args: Parameters<typeof givenLocale>) =>
    givenLocale(...args).then(() => refreshLocaleOverrides());

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

/** The first `lastmod` the products file gives, as a time. */
const lastmodOf = (): Promise<number> =>
    entriesOf('/sitemap/products-1.xml').then(([entry]) => new Date(entry.lastmod!).getTime());

describe('GET /sitemap/pages.xml with the locales module', () => {
    it('points x-default at the first active language when the default one is deactivated', () =>
        withEnvironmentOverrides({ NODE_DEFAULT_LOCALE: 'de' }, async () => {
            await givenServedLocale('de', { active: false });

            const entries = await entriesOf('/sitemap/pages.xml');

            const about = entries.find(({ url }) => url === `${FRONTEND}/it/about`);
            expect(about?.links).toEqual([
                { lang: 'en', url: `${FRONTEND}/en/about` },
                { lang: 'it', url: `${FRONTEND}/it/about` },
                { lang: 'x-default', url: `${FRONTEND}/en/about` }
            ]);
        }));

    it('leaves out a switched-off language that has a deployed file, from every address and alternate', async () => {
        await givenServedLocale('it', { active: false });

        const entries = await entriesOf('/sitemap/pages.xml');

        const about = entries.find(({ url }) => url === `${FRONTEND}/en/about`);
        expect(entries.some(({ url }) => url.includes('/it'))).toBe(false);
        expect(about?.links).toEqual([
            { lang: 'en', url: `${FRONTEND}/en/about` },
            { lang: 'x-default', url: `${FRONTEND}/en/about` }
        ]);
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

describe('GET /sitemap/products-{page}.xml with the locales module', () => {
    it('moves lastmod when a translation is edited', async () => {
        const product = await createProduct();
        const before = await lastmodOf();
        // `updatedAt` has millisecond resolution; this keeps the edit from landing in the same one.
        await new Promise((resolve) => setTimeout(resolve, 20));

        await givenServedLocale('it');
        const edit = await localeService.updateEntityTranslations('product', String(product._id), {
            it: { fields: { title: 'Un titolo nuovo' } }
        });

        expect(edit.success).toBe(true);
        expect(await lastmodOf()).toBeGreaterThan(before);
    });
});
