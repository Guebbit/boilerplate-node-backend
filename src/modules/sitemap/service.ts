/**
 * @module
 * The sitemap's reads: which files exist, and what each lists. One `<url>` per language per page,
 * each carrying the alternates for every language and `x-default` (Google's sitemap form for
 * localised pages), so a crawler learns the translations from the sitemap alone.
 *
 * Nothing is stored: every call reads the live catalogue, which is why the HTTP side may cache.
 *
 * See: docs/modules/sitemap.md
 */

import type { SitemapItemLoose } from 'sitemap';
import { siteConfig } from '@infrastructure/http/config';
import { getDefaultLocale } from '@infrastructure/i18n/catalog';
import { listServedLocales } from '@infrastructure/i18n/served';
import { productPagePath, productService } from '@modules/products';
import { STATIC_PAGES, sitemapConfig } from './config';

/** The languages a page is offered in, and the one `x-default` points at. */
interface Languages {
    /** Every served language tag, in alphabetical order. */
    tags: string[];
    /** The tag `x-default` points at: the default language when it is served, else the first served one. */
    fallback: string;
}

/**
 * The languages the API answers in right now: the same list language negotiation uses, so the
 * sitemap needs no `locales` module and a deployment without one is monolingual. `x-default` is the
 * default language while it is served, otherwise the first served one: a hreflang target must be a
 * page the same sitemap lists.
 */
const servedLanguages = (): Languages => {
    const tags = listServedLocales().toSorted();
    const fallback = getDefaultLocale();
    return { tags, fallback: tags.includes(fallback) ? fallback : tags[0] };
};

/**
 * A page of the paired frontend: its origin, the language segment and the path. Not
 * `frontendLink`, which swaps a language the API has no dictionary for with the default — here a
 * registered language must keep its own address.
 *
 * @param language - the language tag
 * @param path - the page's path under the language; `''` is the home page
 */
const pageAddress = (language: string, path: string): string =>
    `${siteConfig().NODE_FRONTEND_URL}/${language}${path === '' ? '' : `/${path}`}`;

/**
 * One entry per language for a page, each with the alternates for all of them.
 *
 * @param languages - the languages to list
 * @param path - the page's path under the language
 * @param lastmod - when the page's content last changed, when that is known
 */
const entriesFor = (languages: Languages, path: string, lastmod?: Date): SitemapItemLoose[] => {
    const links = [
        ...languages.tags.map((tag) => ({ lang: tag, url: pageAddress(tag, path) })),
        { lang: 'x-default', url: pageAddress(languages.fallback, path) }
    ];
    return languages.tags.map((tag) => ({
        url: pageAddress(tag, path),
        links,
        ...(lastmod ? { lastmod: lastmod.toISOString() } : {})
    }));
};

/**
 * How many products one product file holds: the URL ceiling shared out over the languages, so a
 * file never passes it however many languages the deployment offers.
 *
 * @param languageCount - how many languages each product is listed in
 */
const productsPerFile = (languageCount: number): number =>
    Math.max(1, Math.floor(sitemapConfig().NODE_SITEMAP_URL_LIMIT / languageCount));

/** The sitemap files, by what they list. */
export const sitemapService = {
    /**
     * The addresses of every file the index lists: the shop pages, then one per run of products.
     * Absolute, on this API's own origin.
     */
    listFiles: async (): Promise<string[]> => {
        const languages = servedLanguages();
        const total = await productService.countListed();
        const files = Math.ceil(total / productsPerFile(languages.tags.length));
        const origin = siteConfig().NODE_URL.replace(/\/+$/, '');
        return [
            `${origin}/sitemap/pages.xml`,
            ...Array.from(
                { length: files },
                (_, index) => `${origin}/sitemap/products-${String(index + 1)}.xml`
            )
        ];
    },

    /** The shop's static pages, once per language. They carry no `lastmod`: nothing dates them. */
    listPages: (): Promise<SitemapItemLoose[]> => {
        const languages = servedLanguages();
        return Promise.resolve(STATIC_PAGES.flatMap((path) => entriesFor(languages, path)));
    },

    /**
     * One run of public products, once per language, dated by the product's `updatedAt` — which a
     * translation edit also moves, and a sale does not (stock lives in `inventory`).
     *
     * @param page - 1-based file number
     * @returns the entries, or `null` when the catalogue has no such file
     */
    listProducts: async (page: number): Promise<SitemapItemLoose[] | null> => {
        const languages = servedLanguages();
        const size = productsPerFile(languages.tags.length);
        const products = await productService.listPublicPage(page, size);
        if (products.length === 0) return null;

        return products.flatMap(({ id, updatedAt }) =>
            entriesFor(languages, productPagePath(id), updatedAt)
        );
    }
};
