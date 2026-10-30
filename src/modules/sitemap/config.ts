/**
 * @module
 * What the sitemap needs from the deployment: the ceiling on one file's size (a product page's
 * address is `products/config.ts`). The shop's static pages are `STATIC_PAGES` below, not configuration:
 * a page exists or not with the frontend's router, not per deployment.
 *
 * See: docs/modules/sitemap.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int } from '@infrastructure/config/fields';
import { FRONTEND_LINK_RULES } from '@infrastructure/http/frontend-link';

/** The sitemaps.org ceiling on `<url>` entries in one sitemap file. */
const SITEMAP_URL_LIMIT = 50_000;

/**
 * The public pages of the paired frontend that take no id, as paths under `/<locale>/`. `''` is
 * the home page. From `shared/rules/frontend-links.yaml`, which the frontend's router is checked against.
 */
export const STATIC_PAGES: readonly string[] = FRONTEND_LINK_RULES.staticPages;

/** The sitemap's settings, read per call so a test can vary them. */
export const sitemapConfig = defineConfig({
    name: 'sitemap',
    shape: {
        // Lowered only to make a file split visible; the ceiling is the protocol's own.
        NODE_SITEMAP_URL_LIMIT: int({ default: SITEMAP_URL_LIMIT, min: 1, max: SITEMAP_URL_LIMIT })
    }
});
