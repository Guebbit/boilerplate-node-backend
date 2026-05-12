import winston from "winston";

const { combine, timestamp, printf, colorize, errors, json, splat } =
  winston.format;

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

// Pretty format for local development
const prettyFormat = combine(
  colorize({ all: true }),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  splat(),
  printf(({ level, message, timestamp: ts, stack, service, ...meta }) => {
    const svc = service ? `[${service}] ` : "";
    const extra =
      Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
    if (stack) {
      return `${ts} ${svc}${level}: ${message}\n${stack}`;
    }
    return `${ts} ${svc}${level}: ${message}${extra}`;
  })
);

// JSON format for production/staging
const jsonFormat = combine(
  timestamp(),
  errors({ stack: true }),
  splat(),
  json()
);

const logLevel = process.env.NODE_LOG_LEVEL ?? (isProduction ? "warn" : "debug");

/** Application-wide Winston logger. Pretty in dev, JSON in prod. */
export const logger = winston.createLogger({
  level: logLevel,
  silent: isTest,
  defaultMeta: { service: process.env.NODE_SERVICE_NAME ?? "api" },
  transports: [
    new winston.transports.Console({
      format: isProduction ? jsonFormat : prettyFormat,
    }),
  ],
});

/** Audit logger — always JSON so that security events are machine-parseable. */
export const auditLogger = winston.createLogger({
  level: "info",
  silent: isTest,
  defaultMeta: { service: process.env.NODE_SERVICE_NAME ?? "api", type: "audit" },
  transports: [
    new winston.transports.Console({ format: jsonFormat }),
  ],
});

// Optional Loki transport
export function isLokiEnabled(): boolean {
  return Boolean(process.env.NODE_LOKI_HOST);
}

export async function buildLokiTransport(): Promise<winston.transport | null> {
  if (!isLokiEnabled()) return null;
  const { default: LokiTransport } = await import("winston-loki");
  return new LokiTransport({
    host: process.env.NODE_LOKI_HOST as string,
    labels: { app: process.env.NODE_SERVICE_NAME ?? "api" },
    json: true,
    batching: true,
    interval: 5,
  });
}

/** Strips PII-like keys from log metadata before logging. */
export function redactSensitiveFields(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const sensitive = new Set([
    "password",
    "token",
    "secret",
    "authorization",
    "cookie",
    "credit_card",
    "ssn",
  ]);
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k,
      sensitive.has(k.toLowerCase()) ? "[REDACTED]" : v,
    ])
  );
}

/** Serialises an Error into a plain object suitable for structured logging. */
export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      stack: err.stack,
      ...(err as unknown as Record<string, unknown>),
    };
  }
  return { message: String(err) };
}
