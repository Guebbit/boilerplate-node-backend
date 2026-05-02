import winston from 'winston';

// ---------------------------------------------------------------------------
// Sensitive field redaction
// ---------------------------------------------------------------------------

/**
 * Fields whose values must never appear in logs.
 * Add any new sensitive field names here to keep the list centralised.
 * Matching is case-insensitive.
 */
const SENSITIVE_FIELDS = new Set([
    'password',
    'passwordhash',
    'confirm_password',
    'new_password',
    'old_password',
    'token',
    'access_token',
    'refresh_token',
    'authorization',
    'cookie',
    'jwt',
    'secret',
    'api_key',
    'apikey',
    'private_key',
    'client_secret',
    'credit_card',
    'card_number',
    'cvv',
    'ssn'
]);

/** Replacement value written into logs instead of the real sensitive value. */
const REDACTED = '[REDACTED]';

/**
 * Walk a plain object and replace the values of known sensitive keys with
 * `[REDACTED]`.  Handles nested objects and arrays recursively.
 *
 * Primitive values are returned as-is.
 *
 * @example
 * redactSensitiveFields({ password: 's3cr3t', user: 'alice' })
 * // => { password: '[REDACTED]', user: 'alice' }
 */
export const redactSensitiveFields = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map((item) => redactSensitiveFields(item));

    if (input !== null && typeof input === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
            result[key] = SENSITIVE_FIELDS.has(key.toLowerCase()) ? REDACTED : redactSensitiveFields(value);
        }
        return result;
    }

    // Primitive values (strings, numbers, booleans, …) pass through unchanged
    return input;
};

// ---------------------------------------------------------------------------
// Error serialisation helper
// ---------------------------------------------------------------------------

/**
 * Convert an unknown thrown value into a plain log-friendly object so that
 * Winston JSON transport emits a consistent, queryable shape instead of an
 * opaque `{}`.
 *
 * @example
 * serializeError(new Error('boom'))
 * // => { name: 'Error', message: 'boom', stack: '...' }
 */
export const serializeError = (error: unknown): Record<string, unknown> => {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            // Only include stack outside production to avoid leaking internals
            ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
        };
    }
    // Non-Error values (strings, plain objects, …) are wrapped for consistency
    return { raw: String(error) };
};

// ---------------------------------------------------------------------------
// Custom Winston format: redact + error serialisation
// ---------------------------------------------------------------------------

/**
 * Winston format that applies sensitive-field redaction to every log entry
 * and ensures Error objects serialise correctly.
 *
 * Attach this *before* `winston.format.json()` in the format pipeline so the
 * redacted payload is what gets written to the transport.
 */
const redactFormat = winston.format((info) => {
    // Redact the top-level log payload (spread so we keep Winston's Symbol fields)
    const { level, message, ...rest } = info;

    // Serialize Error message fields if they exist
    if (rest['error'] && rest['error'] instanceof Error) {
        rest['error'] = serializeError(rest['error']);
    }

    // Redact the remaining metadata fields
    const redacted = redactSensitiveFields(rest) as Record<string, unknown>;
    return Object.assign(info, { level, message }, redacted);
});

// ---------------------------------------------------------------------------
// Logger instances
// ---------------------------------------------------------------------------

/**
 * Log level in order of decreasing verbosity:
 *   error > warn > info > http > verbose > debug > silly
 *
 * Controlled by the `NODE_LOG_LEVEL` environment variable.
 * Falls back to `'info'` in production and `'debug'` elsewhere.
 */
const resolveLogLevel = (): string => {
    if (process.env.NODE_LOG_LEVEL) return process.env.NODE_LOG_LEVEL;
    return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
};

/**
 * Common format pipeline shared by all transports:
 * 1. Add ISO timestamp to every entry.
 * 2. Redact sensitive fields and serialise errors.
 * 3. Serialise the final payload as JSON.
 */
const baseFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    redactFormat(),
    winston.format.json()
);

/**
 * Human-readable format used only in non-production environments.
 * Colourised level prefix + timestamp + message + any extra fields.
 */
const prettyFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    redactFormat(),
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaString = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
        return `${String(timestamp)} [${level}] ${String(message)}${metaString}`;
    })
);

/**
 * Application logger.
 *
 * - In production: JSON lines to console + errors written to `error.log`.
 * - In development: colourised, human-readable output for faster debugging.
 *
 * All sensitive fields (passwords, tokens, cookies, secrets) are automatically
 * redacted before any transport writes the entry.
 *
 * Usage:
 * ```ts
 * import { logger } from '@utils/winston';
 *
 * logger.info('Server started', { port: 3000 });
 * logger.error('DB connection failed', { error: err });
 * ```
 */
export const logger = winston.createLogger({
    level: resolveLogLevel(),
    format: baseFormat,
    // Service name used to identify the source application in centralised log
    // backends (Loki, Elastic, Datadog …).  Override with NODE_SERVICE_NAME.
    defaultMeta: {
        service: process.env.NODE_SERVICE_NAME ?? 'api'
    },
    transports: [
        // Write error-level entries to a dedicated file for post-mortem analysis
        new winston.transports.File({
            level: 'error',
            filename: 'error.log'
        }),
        // Console transport: pretty in dev, JSON in production
        new winston.transports.Console({
            format: process.env.NODE_ENV === 'production' ? baseFormat : prettyFormat
        })
    ]
});

// ---------------------------------------------------------------------------
// Audit / security logger
// ---------------------------------------------------------------------------

/**
 * Dedicated logger for security and audit events.
 *
 * Audit events are structurally identical to application logs but are
 * separated so they can be routed to a different sink (e.g. an append-only
 * collection, a SIEM, or a separate Loki stream) without touching the main
 * application log stream.
 *
 * Required fields per entry:
 *  - `action`     — what happened (e.g. `auth.login.failed`)
 *  - `actor`      — who triggered the event (`user_id` or `'anonymous'`)
 *  - `ip`         — client IP (use `req.ip`)
 *  - `request_id` — correlation ID from `req.requestId`
 *
 * Usage:
 * ```ts
 * import { auditLogger } from '@utils/winston';
 *
 * auditLogger.warn('auth.login.failed', {
 *   actor: 'anonymous',
 *   action: 'auth.login.failed',
 *   ip: req.ip,
 *   request_id: req.requestId,
 *   reason: 'invalid_credentials'
 * });
 * ```
 */
export const auditLogger = winston.createLogger({
    level: 'info',
    format: baseFormat,
    defaultMeta: {
        service: process.env.NODE_SERVICE_NAME ?? 'api',
        // Fixed tag so log aggregators can filter audit events by stream label
        log_type: 'audit'
    },
    transports: [
        // Audit entries always go to a dedicated file regardless of environment
        new winston.transports.File({
            filename: 'audit.log'
        }),
        // Mirror to console so local dev can see security events immediately
        new winston.transports.Console({
            format: process.env.NODE_ENV === 'production' ? baseFormat : prettyFormat
        })
    ]
});
