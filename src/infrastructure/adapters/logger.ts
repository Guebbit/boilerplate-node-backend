/**
 * @module
 * Structured logging.
 *
 * See: docs/tools/winston.md
 */

// Winston is the logging library: a `Logger` combines *formats* (a transform pipeline applied
// to every log record) with *transports* (where the record is written). Everything below is
// built out of those two concepts.
import winston from 'winston';

/**
 * Field names that must never be logged in clear text.
 *
 * A `Set`, not an array, so the recursive walk below is O(1) per key. Keys are stored and
 * compared lowercase, catching `Authorization`/`AUTHORIZATION`/`authorization` with one entry.
 *
 * Exported so `tests/unit/infrastructure/adapters/logger.test.ts` can assert every entry
 * individually rather than sampling — a redaction list is a security policy, and the entries
 * nobody sampled are the ones that leak.
 */
export const SENSITIVE_FIELDS = new Set([
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

/** Replacement marker. A fixed string (rather than deletion) keeps log shape stable for parsers. */
const REDACTED = '[REDACTED]';

/**
 * Recursively redact sensitive fields from objects and arrays.
 * Any key present in SENSITIVE_FIELDS is replaced with the literal `[REDACTED]`.
 *
 * Exported for direct unit testing. Note it returns *copies* rather than mutating: the caller
 * usually passes live request/domain objects, and mutating them would corrupt the actual request.
 */
export const redactSensitiveFields = (input: unknown): unknown => {
    // Arrays first: `typeof [] === 'object'`, so without this branch an array would be
    // rebuilt as an object with numeric string keys.
    if (Array.isArray(input)) return input.map((item) => redactSensitiveFields(item));

    // `typeof null === 'object'` in JS, hence the explicit null guard.
    if (input !== null && typeof input === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
            // Redact on key match; otherwise recurse so nested secrets
            // (`{ user: { credentials: { password } } }`) are caught too.
            result[key] = SENSITIVE_FIELDS.has(key.toLowerCase())
                ? REDACTED
                : redactSensitiveFields(value);
        }
        return result;
    }

    // Primitives (string/number/boolean/null/undefined) pass through untouched.
    return input;
};

/**
 * Normalize unknown thrown values into log-safe plain objects.
 * Stack is omitted in production to avoid leaking internals.
 *
 * Needed because `Error` has non-enumerable properties: `JSON.stringify(new Error('x'))`
 * yields `{}`, silently losing the message. This pulls the useful fields onto a plain object.
 */
export const serializeError = (error: unknown): Record<string, unknown> => {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            // Stack traces expose absolute paths and dependency internals — useful locally,
            // an information leak in aggregated production logs.
            ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
        };
    }
    // `throw 'string'` and `throw { code: 1 }` are legal JS; keep *something* readable.
    return { raw: String(error) };
};

/**
 * Apply error serialization and redaction before transport output.
 *
 * `winston.format(fn)` wraps a transform into a reusable format *factory* — calling the result
 * (`redactFormat()`, below) yields the actual format instance; the transform must return the
 * mutated `info` record (returning `false` would drop it entirely). Exported for the same reason
 * as `SENSITIVE_FIELDS`: this is the WIRING, and perfect redaction logic behind broken wiring
 * redacts nothing in production.
 */
export const redactFormat = winston.format((info) => {
    // `level` and `message` are winston's own reserved fields; separating them means the
    // redaction walk only sees caller-supplied metadata.
    const { level, message, ...rest } = info;

    // Turn a raw thrown Error into a serializable object *before* redaction, otherwise
    // the walk above would return an empty `{}` for it.
    if (rest.error && rest.error instanceof Error) {
        rest.error = serializeError(rest.error);
    }

    const redacted = redactSensitiveFields(rest);
    // Mutate `info` in place (winston requires the same object identity back) while
    // overwriting metadata with the redacted copy and restoring the reserved fields.
    return Object.assign(info, { level, message }, redacted);
});

/**
 * Resolve runtime log level with sensible defaults per environment.
 *
 * Winston levels are hierarchical (error < warn < info < http < verbose < debug < silly);
 * `debug` locally, `info` in production to avoid paying ingestion cost for noise. Exported so
 * the environment matrix can be asserted rather than assumed.
 */
export const resolveLogLevel = (): string => {
    if (process.env.NODE_LOG_LEVEL) return process.env.NODE_LOG_LEVEL;
    return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
};

/**
 * Shared JSON format for production log shipping.
 *
 * `format.combine()` composes transforms left to right: timestamp first, then redaction over the
 * full record, then `json()` serializes last — one line per record, which log collectors (Loki,
 * CloudWatch, Datadog) expect.
 */
const baseFormat = winston.format.combine(
    // Explicit ISO-8601 with milliseconds and offset; the winston default is locale-dependent.
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    // Note the call: the factory above must be invoked to yield a format instance.
    redactFormat(),
    winston.format.json()
);

/**
 * Readable format for a person watching a terminal.
 *
 * Same pipeline as `baseFormat` up to redaction, then ANSI colour plus a single-line
 * human layout instead of JSON.
 */
const prettyFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    redactFormat(),
    // `all: true` colours the whole line by level, not just the level token.
    winston.format.colorize({ all: true }),
    // `printf` is the terminal format: whatever string it returns is what gets written.
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        // Append leftover metadata as compact JSON, and only when there is any —
        // otherwise every line would end in a useless `{}`.
        const metaString = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
        // `String(...)` casts because winston types these fields as `unknown`.
        return `${String(timestamp)} [${level}] ${String(message)}${metaString}`;
    })
);

/**
 * Pick the console format from WHO IS READING, not from `NODE_ENV` — conflating the two silently
 * breaks log shipping. `isTTY` is true only for an interactive terminal, false for a pipe or a
 * container log file — exactly when something downstream has to parse the line. Production stays
 * JSON regardless. Exported so the environment matrix can be asserted rather than assumed.
 *
 * See: docs/tools/loki.md
 */
export const resolveConsoleFormat = (): winston.Logform.Format =>
    process.env.NODE_ENV !== 'production' && process.stdout.isTTY ? prettyFormat : baseFormat;

/**
 * Main application logger. Pretty on an interactive terminal, JSON everywhere else.
 *
 * `winston.createLogger()` returns the object every module imports as `logger`.
 * Call it as `logger.info('text')` or `logger.info({ message: 'text', ...meta })`.
 */
export const logger = winston.createLogger({
    // Minimum severity that gets emitted at all (see `resolveLogLevel`).
    level: resolveLogLevel(),
    // Logger-wide pipeline. The Console transport below overrides it per-environment,
    // but it stays the default for any transport added without its own `format`.
    format: baseFormat,
    // Merged into every record — lets a log aggregator filter by service when several
    // apps ship to the same backend.
    defaultMeta: {
        service: process.env.NODE_SERVICE_NAME ?? 'api'
    },
    transports: [
        // stdout only, deliberately: in containers the platform owns log collection and
        // rotation, so writing files inside the container would just fill the layer up.
        new winston.transports.Console({
            format: resolveConsoleFormat()
        })
    ]
});

/**
 * Dedicated stream for security/audit events. Always JSON.
 *
 * Separate from `logger` on purpose: audit records are a compliance artefact, so they can't be
 * silenced by `NODE_LOG_LEVEL` (hard-coded `info`) or reformatted for dev reading (always
 * `baseFormat`) — the shape has to stay machine-stable. Fed by `@infrastructure/observability/audit`.
 */
export const auditLogger = winston.createLogger({
    // Fixed, not env-driven: audit trails cannot be turned off by configuration.
    level: 'info',
    format: baseFormat,
    defaultMeta: {
        service: process.env.NODE_SERVICE_NAME ?? 'api',
        // Discriminator so the collector can route these to a separate index/retention policy.
        log_type: 'audit'
    },
    transports: [
        // JSON in every environment, dev included.
        new winston.transports.Console({
            format: baseFormat
        })
    ]
});
