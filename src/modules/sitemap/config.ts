/**
 * @module
 * What the sitemap needs from the deployment: the shape of a product page's address and the
 * ceiling on one file's size. The shop's static pages are code, not configuration — they are
 * `STATIC_PAGES` below, since a page exists or not with the frontend's router, not per deployment.
 *
 * See: docs/modules/sitemap.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int, text } from '@infrastructure/config/fields';

/** The sitemaps.org ceiling on `<url>` entries in one sitemap file. */
const SITEMAP_URL_LIMIT = 50_000;

/**
 * The public pages of the paired frontend that take no id, as paths under `/<locale>/`. `''` is
 * the home page. Kept in step with the frontend's router by the live check that opens each one.
 */
export const STATIC_PAGES: readonly string[] = [
    '',
    'about',
    'faq',
    'terms',
    'privacy',
    'contact',
    'products'
];

/** The sitemap's settings, read per call so a test can vary them. */
export const sitemapConfig = defineConfig({
    name: 'sitemap',
    shape: {
        // `{id}` is replaced by the product's id, like every `NODE_FRONTEND_LINK_*` template.
        NODE_FRONTEND_LINK_PRODUCT: text({ default: 'products/{id}' }),
        // Lowered only to make a file split visible; the ceiling is the protocol's own.
        NODE_SITEMAP_URL_LIMIT: int({ default: SITEMAP_URL_LIMIT, min: 1, max: SITEMAP_URL_LIMIT })
    }
});
