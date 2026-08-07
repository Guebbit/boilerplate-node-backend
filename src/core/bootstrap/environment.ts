/**
 * Environment validation.
 *
 * Only *hard* requirements live here — variables the app cannot function without.
 * Optional infrastructure (Redis, RabbitMQ, SMTP, PostHog, OTLP) is deliberately absent:
 * those adapters degrade gracefully when unconfigured, so requiring them would make
 * local development harder for no safety gain.
 */

import { assertImageStoreReady } from '@core/adapters/image-store';

/**
 * JWT signing secrets. Without these the auth layer would silently sign tokens with
 * `undefined`, so they are non-negotiable.
 * `as const` narrows the array to a readonly tuple of literals, which makes
 * `process.env[key]` type-safe below.
 */
const REQUIRED_ENV_KEYS = ['NODE_TOKEN_ACCESS', 'NODE_TOKEN_REFRESH'] as const;

/**
 * Fail fast on missing mandatory configuration so runtime errors do not appear only after serving traffic.
 *
 * Called at the very top of the boot sequence: throwing here crashes the process before
 * the HTTP listener opens, so an orchestrator (Docker/Kubernetes) sees a failed start
 * instead of a container that accepts requests and then 500s on the first login.
 */
export const validateRequiredEnvironment = () => {
    // Treat whitespace-only values as missing — a common accident in .env files and
    // in CI secret injection, where an unset secret expands to an empty string.
    const missing = REQUIRED_ENV_KEYS.filter((key) => {
        const value = process.env[key];
        return !value || value.trim() === '';
    });

    // Report every missing key at once rather than one per restart cycle.
    if (missing.length > 0)
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);

    // The database can be configured two ways (see `bootstrap/database.ts` → `getDatabaseUri`):
    // a full connection URI, or host/port/name fragments. Either is fine, but not neither.
    const hasMongoUri = Boolean(process.env.NODE_DB_URI?.trim());
    const hasMongoPort = Boolean(process.env.NODE_MONGODB_PORT?.trim());

    if (!hasMongoUri && !hasMongoPort)
        throw new Error('Missing database configuration: set NODE_DB_URI or NODE_MONGODB_PORT');

    // Image storage is the one adapter that must NOT degrade gracefully. Asking for a remote store
    // and getting local disk is not a reduced service, it is images written to two different places
    // depending on when the request arrived — discovered on the rebuild that loses half of them.
    assertImageStoreReady();
};
