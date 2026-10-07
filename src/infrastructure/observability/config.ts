/**
 * @module
 * Product analytics configuration: which provider, whether consent gates it, and each provider's
 * own endpoint and credentials.
 *
 * `NODE_ANALYTICS_PROVIDER` is plain text here: the set of valid names lives in the provider
 * registry, which imports this file. The registry's resolver refuses an unknown name, and the app
 * tier probes it at boot (`app/config.ts`).
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { flag, text } from '@infrastructure/config/fields';

/** Analytics providers and their credentials. */
export const analyticsConfig = defineConfig({
    name: 'analytics',
    shape: {
        NODE_ANALYTICS_PROVIDER: text({ default: 'umami', case: 'lower' }),
        NODE_ANALYTICS_REQUIRE_CONSENT: flag({ default: true }),
        NODE_UMAMI_HOST: text(),
        NODE_UMAMI_INGEST_HOST: text(),
        NODE_UMAMI_WEBSITE_ID: text(),
        NODE_POSTHOG_API_KEY: text({ sensitive: true }),
        NODE_POSTHOG_HOST: text()
    }
});
