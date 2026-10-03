/**
 * @module
 * `observability`' configuration: the scrape credential, and which telemetry sinks are wired.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { secret, text } from '@infrastructure/config/fields';

/**
 * `.env-example` ships `change-me-dev-metrics-token`, which scrapes `/observability/metrics` if
 * left as-is. `minLength: 0` on purpose — UNSET is a supported, already-fail-closed state
 * (`isMetricsScraper` denies by default, 503), so this only refuses to boot on the one dangerous
 * state: the token SET to the known placeholder.
 */
export const observabilityConfig = defineConfig({
    name: 'observability',
    shape: {
        NODE_METRICS_TOKEN: secret({
            minLength: 0,
            placeholder: 'change-me-dev-metrics-token',
            describe: 'Bearer token a Prometheus scraper presents. Unset refuses every scrape.'
        }),
        NODE_LOKI_HOST: text({ describe: 'Loki host; reported by the health payload only.' }),
        NODE_FARO_COLLECTOR_URL: text({
            describe: 'Faro collector for browser telemetry; reported by the health payload only.'
        })
    }
});
