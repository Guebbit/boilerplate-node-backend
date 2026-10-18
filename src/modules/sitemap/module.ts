/**
 * @module
 * Sitemap: `sitemap.xml` for search engines, built on request from the live catalogue. Owns no
 * collection — it reads `products` and `locales` through their services.
 *
 * See: docs/modules/sitemap.md
 */

import type { AppModule } from '@kernel/registry';
import { sitemapConfig } from './config';
import { router } from './routes';

/** This module's manifest entry: its routes and its settings. */
export default {
    name: 'sitemap',
    basePath: '/sitemap',
    routes: router,
    config: [sitemapConfig.slice],
    // Owns no collection: it publishes addresses that are already public.
    personalData: 'none'
} satisfies AppModule;
