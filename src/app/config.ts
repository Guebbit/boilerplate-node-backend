/**
 * @module
 * The application's own configuration, and the one list of every slice a boot validates.
 *
 * Owns:        the HTTP server's bounds and the security.txt contact — the app tier's own variables.
 * Assembles:   every infrastructure and kernel slice, so a deployment's whole environment is
 *              judged in one pass. Module slices come from each manifest (`AppModule.config`).
 * Probes:      the provider selectors whose valid names live in a registry that imports its own
 *              config — a typo is refused here, at boot, not on the first request.
 *
 * See: docs/tools/configuration.md
 */

import { assertConfig, defineConfig, type ConfigSlice } from '@infrastructure/config/define';
import { int, text } from '@infrastructure/config/fields';
import {
    antibotConfig,
    imageConfig,
    mailConfig,
    mailFilesConfig,
    pdfConfig,
    queueConfig,
    redisConfig
} from '@infrastructure/adapters/config';
import { humanChallengeProviderProbe } from '@infrastructure/adapters/antibot-providers';
import { mailTransportProbe } from '@infrastructure/adapters/mail-transports';
import {
    idempotencyConfig,
    rateLimitBudgetConfig,
    rateLimitConfig,
    responseCacheConfig,
    siteConfig,
    uploadConfig
} from '@infrastructure/http/config';
import { INFRASTRUCTURE_RATE_LIMITS } from '@infrastructure/http/middlewares/rate-limit';
import { localeConfig } from '@infrastructure/i18n/config';
import { analyticsProviderProbe } from '@infrastructure/observability/analytics';
import { analyticsConfig } from '@infrastructure/observability/config';
import { persistenceConfig } from '@infrastructure/persistence/config';
import {
    clusterConfig,
    databaseConfig,
    loggingConfig,
    nodeEnvironmentConfig,
    serverConfig,
    tracingConfig
} from '@infrastructure/runtime/config';
import {
    breachedPasswordsConfig,
    piiConfig,
    pseudonymConfig
} from '@infrastructure/security/config';
import type { SecurityTxtSettings } from '@app/security-txt';
import { configSlicesOf } from '@kernel/module-config';
import { outboxConfig, reauthConfig } from '@kernel/config';
import type { AppModule } from '@kernel/registry';
import { enabledModules } from '../modules';

/**
 * The app tier's own variables: request-parsing and connection bounds, the trust-proxy hop count,
 * and the `/.well-known/security.txt` fields.
 */
export const appConfig = defineConfig({
    name: 'app',
    shape: {
        NODE_JSON_BODY_LIMIT: text({
            default: '100kb',
            describe:
                'Largest JSON or form body, as `bytes`-style text. Explicit rather than express’s implicit default.'
        }),
        NODE_HTTP_HEADERS_TIMEOUT_MS: int({
            default: 15_000,
            min: 1,
            describe: 'How long a client may take to send its headers (slowloris bound).'
        }),
        NODE_HTTP_REQUEST_TIMEOUT_MS: int({
            default: 120_000,
            min: 1,
            describe: 'How long a client may take to send a whole request, body included.'
        }),
        NODE_HTTP_KEEP_ALIVE_TIMEOUT_MS: int({
            default: 5000,
            min: 1,
            describe: 'Idle keep-alive lifetime. Raise it above the proxy’s own idle timeout.'
        }),
        NODE_TRUST_PROXY_HOPS: int({
            default: 0,
            min: 0,
            describe:
                'Reverse proxies in front of the API. Too low buckets callers together; too high lets one forge X-Forwarded-For.'
        }),
        NODE_SECURITY_CONTACT: text({
            describe: 'security.txt Contact (RFC 9116). Unset publishes nothing.'
        }),
        NODE_SECURITY_EXPIRES: text({
            describe: 'security.txt Expires, an ISO date. Unset publishes nothing.'
        }),
        NODE_SECURITY_POLICY_URL: text({ describe: 'security.txt Policy link.' })
    }
});

/** The infrastructure rate-limit budgets, as a slice — the budgets no single module owns. */
const infrastructureRateLimits = rateLimitBudgetConfig(
    'infrastructure-rate-limits',
    INFRASTRUCTURE_RATE_LIMITS
);

/**
 * What the security.txt builders read: the contact fields and this API's own address.
 *
 * @returns the settings, parsed
 */
export const securityTxtSettings = (): SecurityTxtSettings => ({
    ...appConfig(),
    NODE_URL: siteConfig().NODE_URL
});

/**
 * Every infrastructure, kernel and app slice — everything a boot validates that no module owns.
 * Read by `registerModules` (which adds each manifest's own slices), the cluster primary and
 * `runScript`, so the same environment is judged the same way wherever the process starts.
 */
export const APP_CONFIG_SLICES: readonly ConfigSlice[] = [
    nodeEnvironmentConfig,
    loggingConfig,
    serverConfig,
    clusterConfig,
    databaseConfig,
    tracingConfig,
    pseudonymConfig,
    piiConfig,
    breachedPasswordsConfig,
    mailConfig,
    mailTransportProbe,
    mailFilesConfig,
    queueConfig,
    redisConfig,
    imageConfig,
    pdfConfig,
    antibotConfig,
    humanChallengeProviderProbe,
    siteConfig,
    rateLimitConfig,
    infrastructureRateLimits,
    uploadConfig,
    responseCacheConfig,
    idempotencyConfig,
    localeConfig,
    persistenceConfig,
    analyticsConfig,
    analyticsProviderProbe,
    reauthConfig,
    outboxConfig,
    appConfig
].map((accessor) => accessor.slice);

/**
 * The complete list for a process: the app tier's slices and each enabled module's own.
 *
 * @param appModules - the enabled module list
 * @returns every slice, in a stable order
 */
export const allConfigSlices = (appModules: readonly AppModule[]): readonly ConfigSlice[] => [
    ...APP_CONFIG_SLICES,
    ...appModules.flatMap((appModule) => configSlicesOf(appModule))
];

/**
 * Refuse to run on a bad environment: judge every slice of every enabled module, exactly as
 * `registerModules` does at app boot.
 *
 * For the entry points that never go through `createApp()` — the cluster primary (one clean
 * error, instead of every worker crash-looping on it) and `runScript` (all 11 ops scripts).
 *
 * @throws {ConfigError} when anything is wrong
 */
export const assertProcessConfig = (): void => assertConfig(allConfigSlices(enabledModules));
