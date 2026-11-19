/**
 * @module
 * The process's own configuration: which environment it is, how it names and logs itself, where
 * it listens, where its database is, and its tracing endpoint.
 *
 * Relative imports only: `adapters/logger.ts` sits on jest's `globalSetup` import chain, where the
 * `@infrastructure` alias does not resolve, and it reads this file.
 *
 * @see docs/operate/configuration.md#who-owns-what
 */

import { defineConfig, isRelaxedIn } from '../config/define';
import { choice, flag, int, text } from '../config/fields';

/** The log levels winston knows, lowest severity last. */
const LOG_LEVELS = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'] as const;

/**
 * The two worker process roles: `standard` takes the light and external jobs, `heavy` the heavy
 * ones — see `src/infrastructure/adapters/job-kinds.ts`. The value of `NODE_WORKER_ROLE`.
 */
export const WORKER_ROLES = ['standard', 'heavy'] as const;

/** See {@link WORKER_ROLES}. */
export type WorkerRole = (typeof WORKER_ROLES)[number];

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

/** Where the HTTP server listens, where the worker's own small listener does, which jobs a worker takes, and how both shut down. */
export const serverConfig = defineConfig({
    name: 'server',
    shape: {
        NODE_PORT: int({ default: 3000, min: 1, max: 65_535 }),
        NODE_WORKER_PORT: int({ default: 3010, min: 1, max: 65_535 }),
        NODE_WORKER_ROLE: choice(WORKER_ROLES, { default: 'standard' }),
        NODE_HOST: text(),
        NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS: int({ default: 15_000, min: 1 }),
        NODE_SHUTDOWN_DELAY_MS: int({ default: 0, min: 0 })
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

/** Trace export, and whether inbound trace context is trusted. */
export const tracingConfig = defineConfig({
    name: 'tracing',
    shape: {
        OTEL_EXPORTER_OTLP_ENDPOINT: text(),
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: text(),
        // The exporter's auth headers, for a deployment that mounts them as a secret file (`_FILE`).
        NODE_OTEL_EXPORTER_OTLP_HEADERS: text({ sensitive: true }),
        NODE_TRUSTED_INGRESS: flag({ default: false })
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
 * OWASP "secure by default": https://devguide.owasp.org/en/04-design/02-web-app-checklist/01-secure-by-default/
 * @see docs/understand/security.md#one-environment-switch
 */
export const isRelaxedEnvironment = (): boolean => isRelaxedIn({ NODE_ENV: nodeEnvironment() });
