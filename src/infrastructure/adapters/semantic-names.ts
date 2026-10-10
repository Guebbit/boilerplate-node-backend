/**
 * @module
 * The names a structured log line is WRITTEN with.
 *
 * Code logs camelCase fields (`actorUserId`, `statusCode`). The line that reaches Loki, a SIEM
 * or any other collector carries OpenTelemetry semantic-convention names instead (`user.id`,
 * `http.response.status_code`), so a dashboard or an alert written against the standard works
 * here unchanged.
 *
 * Relative imports only: `logger.ts` sits on jest's `globalSetup` import chain.
 *
 * See: docs/tools/winston.md#field-names-in-the-log-line
 */

/** One structured log record, before or after the rename. */
type LogRecord = Record<string, unknown>;

/**
 * Field name in code -> name on the log line.
 *
 * Standard names where OpenTelemetry has one (https://opentelemetry.io/docs/specs/semconv/),
 * `app.*` where it has none: the spec asks custom attributes to live under the producer's own
 * namespace, never to squat on a standard one.
 *
 * `traceId` and `spanId` become `trace_id` and `span_id`: the OpenTelemetry Logs Data Model
 * puts trace context at the top level of a record, and `@opentelemetry/instrumentation-winston`
 * writes exactly those two keys. Grafana's Loki -> Tempo link reads `trace_id` (docs/tools/loki.md).
 */
export const SEMANTIC_LOG_NAMES: Readonly<Record<string, string>> = {
    service: 'service.name',
    traceId: 'trace_id',
    spanId: 'span_id',
    requestId: 'app.request.id',
    clientRequestId: 'app.request.client_id',
    method: 'http.request.method',
    route: 'http.route',
    statusCode: 'http.response.status_code',
    durationMs: 'app.request.duration_ms',
    ip: 'client.address',
    userAgent: 'user_agent.original',
    action: 'event.name',
    outcome: 'app.audit.outcome',
    actorUserId: 'user.id',
    actorRoleName: 'app.actor.role_name',
    actorCredentialId: 'app.actor.credential_id',
    actorScope: 'app.actor.scope',
    targetType: 'app.target.type',
    targetId: 'app.target.id'
};

/**
 * Whether a value is a serialised error: what `redactFormat` leaves under `error` for an `Error`.
 * @param value - whatever the call site put under `error`
 */
const isSerialisedError = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * `error` -> the `exception.*` attributes (https://opentelemetry.io/docs/specs/semconv/exceptions/).
 * A bare string or number becomes `exception.message`.
 *
 * @param error - the value logged under `error`
 * @returns the attributes to merge into the record
 */
const exceptionAttributes = (error: unknown): LogRecord => {
    if (!isSerialisedError(error)) return { 'exception.message': String(error) };
    const { name, message, stack, cause, ...rest } = error;
    return {
        ...(name !== undefined && { 'exception.type': name }),
        ...(message !== undefined && { 'exception.message': message }),
        ...(stack !== undefined && { 'exception.stacktrace': stack }),
        ...(cause !== undefined && { 'exception.cause': cause }),
        // Anything else on the error (an `ApiError`'s code, a Mongo error's index) stays visible.
        ...(Object.keys(rest).length > 0 && { 'exception.details': rest })
    };
};

/**
 * The record with its field names replaced; values are untouched.
 *
 * Top level only: nested objects (`metadata`, `error.cause`) are the call site's own shape. A
 * field is left alone when its target name is already taken, so an explicit `'user.id'` set by a
 * caller is never overwritten by a mapped one.
 *
 * @param record - the record after redaction
 * @returns a new record carrying the semantic-convention names
 */
export const toSemanticNames = (record: LogRecord): LogRecord => {
    const renamed: LogRecord = {};
    for (const [key, value] of Object.entries(record)) {
        if (key === 'error' && value !== undefined)
            Object.assign(renamed, exceptionAttributes(value));
        // `user.roles` is a list in the convention, one entry here: the role the actor held.
        else if (key === 'actorRole') renamed['user.roles'] = [value];
        else renamed[SEMANTIC_LOG_NAMES[key] ?? key] = value;
    }
    return renamed;
};
