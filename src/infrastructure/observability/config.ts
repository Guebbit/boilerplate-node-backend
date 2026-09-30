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
        NODE_ANALYTICS_PROVIDER: text({
            default: 'umami',
            lower: true,
            describe: 'Where product events go: umami, posthog or none.'
        }),
        NODE_ANALYTICS_REQUIRE_CONSENT: flag({
            default: true,
            describe: 'Only capture an event when the caller consented (GDPR Art. 25(2) default).'
        }),
        NODE_UMAMI_HOST: text({
            describe: 'Umami’s PUBLIC origin, where a browser loads the tracker.'
        }),
        NODE_UMAMI_INGEST_HOST: text({
            describe: 'The address this server dials to send events. Falls back to the public host.'
        }),
        NODE_UMAMI_WEBSITE_ID: text({ describe: 'The Umami website id events are attributed to.' }),
        NODE_POSTHOG_API_KEY: text({
            sensitive: true,
            describe: 'PostHog write-only project key.'
        }),
        NODE_POSTHOG_HOST: text({
            describe: 'PostHog host. Explicit: a default would pick a region for you.'
        })
    }
});
