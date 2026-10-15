/**
 * @module
 * The process's own configuration: which environment it is, how it names and logs itself, where
 * it listens, how it clusters, where its database is, and its tracing endpoint.
 *
 * Relative imports only: `adapters/logger.ts` sits on jest's `globalSetup` import chain, where the
 * `@infrastructure` alias does not resolve, and it reads this file.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig, isRelaxedIn } from '../config/define';
import { choice, flag, int, text } from '../config/fields';

/** The log levels winston knows, lowest severity last. */
const LOG_LEVELS = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'] as const;

/** How a personal field appears in a log line. See `adapters/logger.ts`. */
export const PERSONAL_FIELD_MODES = ['hash', 'redact', 'plain'] as const;

/** Which environment this process is: the one switch every safety behaviour keys off. */
export const nodeEnvironmentConfig = defineConfig({
    name: 'environment',
    shape: {
        NODE_ENV: text({
            // Verbatim: ` development` with a stray space is a typo, and a typo must stay strict.
            verbatim: true
        })
    }
});

/** How the process names itself, and how it logs. */
export const loggingConfig = defineConfig({
    name: 'logging',
    shape: {
        NODE_SERVICE_NAME: text({ default: 'api' }),
        NODE_LOG_LEVEL: choice(LOG_LEVELS, {}),
        NODE_LOG_PERSONAL_FIELDS: choice(PERSONAL_FIELD_MODES, { default: 'hash' })
    }
});

/** Where the HTTP server listens, and how it shuts down. */
export const serverConfig = defineConfig({
    name: 'server',
    shape: {
        NODE_PORT: int({ default: 3000, min: 1, max: 65_535 }),
        NODE_HOST: text(),
        NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS: int({ default: 15_000, min: 1 })
    }
});

/** The cluster primary's supervision knobs. */
export const clusterConfig = defineConfig({
    name: 'cluster',
    shape: {
        NODE_ENABLE_CLUSTERING: flag({ default: false }),
        NODE_CLUSTER_WORKERS: int({ default: 0, min: 0 }),
        NODE_CLUSTER_CRASH_WINDOW_MS: int({ default: 60_000, min: 1 }),
        NODE_CLUSTER_CRASH_BACKOFF_BASE_MS: int({ default: 500, min: 1 }),
        NODE_CLUSTER_CRASH_BACKOFF_MAX_MS: int({ default: 30_000, min: 1 }),
        NODE_CLUSTER_SHUTDOWN_TIMEOUT_MS: int({ default: 15_000, min: 1 }),
        NODE_CLUSTER_CRASH_LIMIT: int({ default: 10, min: 1 })
    }
});

/** Where MongoDB is. */
export const databaseConfig = defineConfig({
    name: 'database',
    shape: {
        NODE_DB_URI: text(),
        NODE_DB_PASSWORD: text({ sensitive: true }),
        NODE_MONGODB_HOST: text({ default: '127.0.0.1' }),
        NODE_MONGODB_PORT: int({ default: 27_017, min: 1, max: 65_535 }),
        NODE_MONGODB_NAME: text({ default: 'boilerplate-node-backend' }),
        NODE_MONGO_MAX_TIME_MS: int({ default: 5000, min: 0 })
    }
});

/**
 * The restock mark, declared once. Infrastructure, not a module's, because `inventory` (its stock
 * board) and `products` (the storefront's `lowStock` flag) both read it, and `inventory` depends
 * on `products`, so neither may import the other's config. One declaration keeps the badge and
 * the board agreeing on what "low" means.
 */
export const stockConfig = defineConfig({
    name: 'stock',
    shape: {
        NODE_LOW_STOCK_THRESHOLD: int({ default: 5, min: 0 })
    }
});

/** Trace export, whether inbound trace context is trusted, and the version stamped on it. */
export const tracingConfig = defineConfig({
    name: 'tracing',
    shape: {
        OTEL_EXPORTER_OTLP_ENDPOINT: text(),
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: text(),
        NODE_TRUSTED_INGRESS: flag({ default: false }),
        npm_package_version: text({ default: '0.0.0' })
    }
});

/**
 * `NODE_ENV`, as configured.
 *
 * @returns the raw value, `undefined` when unset
 */
export const nodeEnvironment = (): string | undefined => nodeEnvironmentConfig().NODE_ENV;

/**
 * Whether this process is a test run — the rail that keeps a suite from opening sockets or
 * installing signal handlers.
 */
export const isTestEnvironment = (): boolean => nodeEnvironment() === 'test';

/**
 * Whether this process may run with its safety switches off: `NODE_ENV` is exactly `development`
 * or `test`, and nothing else.
 *
 * The one definition of "not a deployment". Every protection that turns on for a real server —
 * `Secure` cookies, the seeder's refusal, the production-only secrets, stack traces kept out of
 * logs — keys off this, so an unset `NODE_ENV`, a `staging` one or a typo gets the strict
 * behaviour, not the loose one. Fail closed: there are two settings, a developer's machine or CI,
 * and every server.
 *
 * See: docs/tools/security.md#one-environment-switch
 * OWASP "secure by default": https://devguide.owasp.org/en/04-design/02-web-app-checklist/01-secure-by-default/
 */
export const isRelaxedEnvironment = (): boolean => isRelaxedIn({ NODE_ENV: nodeEnvironment() });
