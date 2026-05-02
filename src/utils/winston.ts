import winston from 'winston';

// Field names that must never be logged in clear text.
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

const REDACTED = '[REDACTED]';

// Recursively redact sensitive fields from objects and arrays.
export const redactSensitiveFields = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map((item) => redactSensitiveFields(item));

    if (input !== null && typeof input === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
            result[key] = SENSITIVE_FIELDS.has(key.toLowerCase()) ? REDACTED : redactSensitiveFields(value);
        }
        return result;
    }

    return input;
};

// Normalize unknown thrown values into log-safe objects.
export const serializeError = (error: unknown): Record<string, unknown> => {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
        };
    }
    return { raw: String(error) };
};

// Apply error serialization and redaction before transport output.
const redactFormat = winston.format((info) => {
    const { level, message, ...rest } = info;

    if (rest['error'] && rest['error'] instanceof Error) {
        rest['error'] = serializeError(rest['error']);
    }

    const redacted = redactSensitiveFields(rest) as Record<string, unknown>;
    return Object.assign(info, { level, message }, redacted);
});

// Resolve runtime log level with sensible defaults.
const resolveLogLevel = (): string => {
    if (process.env.NODE_LOG_LEVEL) return process.env.NODE_LOG_LEVEL;
    return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
};

// Shared JSON format for production log shipping.
const baseFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    redactFormat(),
    winston.format.json()
);

// Readable local format for non-production runs.
const prettyFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    redactFormat(),
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaString = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
        return `${String(timestamp)} [${level}] ${String(message)}${metaString}`;
    })
);

// Main application logger.
export const logger = winston.createLogger({
    level: resolveLogLevel(),
    format: baseFormat,
    defaultMeta: {
        service: process.env.NODE_SERVICE_NAME ?? 'api'
    },
    transports: [
        new winston.transports.File({
            level: 'error',
            filename: 'error.log'
        }),
        new winston.transports.Console({
            format: process.env.NODE_ENV === 'production' ? baseFormat : prettyFormat
        })
    ]
});

// Dedicated stream for security/audit events.
export const auditLogger = winston.createLogger({
    level: 'info',
    format: baseFormat,
    defaultMeta: {
        service: process.env.NODE_SERVICE_NAME ?? 'api',
        log_type: 'audit'
    },
    transports: [
        new winston.transports.File({
            filename: 'audit.log'
        }),
        new winston.transports.Console({
            format: process.env.NODE_ENV === 'production' ? baseFormat : prettyFormat
        })
    ]
});
