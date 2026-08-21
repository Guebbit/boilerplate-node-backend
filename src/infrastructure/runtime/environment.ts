/**
 * Environment validation, and the two coercions every reader shares.
 *
 * Only *hard* requirements are validated here — variables the app cannot function without.
 * Optional infrastructure (Redis, RabbitMQ, SMTP, PostHog, OTLP) is deliberately absent:
 * those adapters degrade gracefully when unconfigured, so requiring them would make
 * local development harder for no safety gain.
 *
 * Everything else keeps reading `process.env` where it is used, and lazily — a value set after
 * import still applies, and a test can set a variable without knowing which import order froze it.
 * What is centralised is the COERCION, because a variable is always a string and there are only
 * two things this app does with one it did not just use verbatim: read it as a number, or read it
 * as a switch. Both were written several ways, and two of the spellings answered `NaN`.
 */

/**
 * An integer from the environment, or `fallback` when the variable is unusable.
 *
 * Unusable means absent, blank, or not exactly an integer — and the fallback is what makes that
 * safe. The two spellings this replaces both failed here, in opposite directions:
 * `Number(process.env.X ?? 30)` answers `NaN` for a typo, which propagates into a `Date`, a
 * comparison or a `maxAge` and misbehaves with no error attached; bare `parseInt` reads a
 * trailing unit, so `NODE_MAX_UPLOAD_BYTES=5mb` becomes a five-BYTE limit. A whole-string match
 * refuses both and takes the documented default instead.
 *
 * Base 10 explicitly, so a zero-padded `0900` is 900 rather than octal.
 *
 * @param key - the variable's name
 * @param fallback - the value a deployment gets when it did not usably set one
 * @param min - reject a parsed value below this, falling back instead. For the readers whose
 *   number is a size or an interval, where `0` and negatives are not smaller settings but broken
 *   ones.
 */
const INTEGER = /^[+-]?\d+$/;

export const environmentNumber = (key: string, fallback: number, min?: number): number => {
    const raw = process.env[key]?.trim();
    if (!raw || !INTEGER.test(raw)) return fallback;

    const parsed = Number.parseInt(raw, 10);
    return min !== undefined && parsed < min ? fallback : parsed;
};

/** The strings a deployment may write for "on" and "off", either case. */
const TRUTHY = new Set(['1', 'true', 'yes', 'on']);
const FALSY = new Set(['0', 'false', 'no', 'off']);

/**
 * A switch from the environment, or `fallback` when the variable says nothing recognisable.
 *
 * Both vocabularies are accepted, because both were already in use: kill switches were written
 * `!== '0'` and opt-ins `=== '1'` or `=== 'true'`, so `NODE_DEMO=1` turned demo mode off and
 * `NODE_RABBITMQ_ENABLED=false` left the queue on. A flag now means the same thing everywhere,
 * and an unrecognised value takes the default rather than silently reading as "off".
 *
 * @param key - the variable's name
 * @param fallback - the value a deployment gets when it did not usably set one
 */
export const environmentFlag = (key: string, fallback: boolean): boolean => {
    const raw = process.env[key]?.trim().toLowerCase();
    if (raw === undefined || raw === '') return fallback;
    if (TRUTHY.has(raw)) return true;
    if (FALSY.has(raw)) return false;
    return fallback;
};

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
};
