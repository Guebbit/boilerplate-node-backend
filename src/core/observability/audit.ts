/**
 * Audit trail — the "who did what to which resource, and did it work" record.
 *
 * Deliberately separate from application logging: audit entries are a security/compliance
 * artefact, so they go to a dedicated always-on logger (see `auditLogger`) with a stable,
 * machine-readable field set that must not be reshaped for convenience.
 *
 * See: docs/tools/winston.md
 */

import { auditLogger } from '@core/adapters/logger';
import { getActiveSpanContext } from '@core/observability/tracer';

/*
 * Action constants — domain.resource.verb dot-notation.
 * The dotted convention lets a log backend filter by prefix: `auth.*` for all authentication
 * activity, `admin.product.*` for one resource. An enum (not raw strings) keeps the vocabulary
 * closed, so an alert built on `auth.login.failed` cannot be defeated by a typo at a call site.
 */
export enum AuditAction {
    // Auth
    AUTH_LOGIN_SUCCEEDED = 'auth.login.succeeded',
    AUTH_LOGIN_FAILED = 'auth.login.failed',
    AUTH_SIGNUP_SUCCEEDED = 'auth.signup.succeeded',
    AUTH_SIGNUP_FAILED = 'auth.signup.failed',
    AUTH_PASSWORD_RESET_REQUESTED = 'auth.password_reset.requested',
    AUTH_PASSWORD_RESET_COMPLETED = 'auth.password_reset.completed',
    AUTH_ACCOUNT_DELETE_REQUESTED = 'auth.account_delete.requested',
    AUTH_ACCOUNT_DELETE_COMPLETED = 'auth.account_delete.completed',
    AUTH_REFRESH_SUCCEEDED = 'auth.refresh.succeeded',
    AUTH_REFRESH_FAILED = 'auth.refresh.failed',
    AUTH_LOGOUT_ALL_SUCCEEDED = 'auth.logout_all.succeeded',
    AUTH_TOKEN_EXPIRED_CLEANUP = 'auth.token.expired_cleanup',

    // Admin: users
    ADMIN_USER_CREATED = 'admin.user.created',
    ADMIN_USER_UPDATED = 'admin.user.updated',
    ADMIN_USER_DELETED = 'admin.user.deleted',

    // Admin: products
    ADMIN_PRODUCT_CREATED = 'admin.product.created',
    ADMIN_PRODUCT_UPDATED = 'admin.product.updated',
    ADMIN_PRODUCT_DELETED = 'admin.product.deleted',

    // Admin: orders
    ADMIN_ORDER_CREATED = 'admin.order.created',
    ADMIN_ORDER_UPDATED = 'admin.order.updated',
    ADMIN_ORDER_DELETED = 'admin.order.deleted',

    // Admin: feedback
    ADMIN_FEEDBACK_VIEWED = 'admin.feedback.viewed',
    ADMIN_FEEDBACK_STATUS_UPDATED = 'admin.feedback.status_updated',

    // Cart (user-facing)
    USER_CART_ITEM_REMOVED = 'user.cart.item_removed',

    // Security / access-control
    SECURITY_UNAUTHORIZED = 'security.unauthorized',
    SECURITY_FORBIDDEN = 'security.forbidden',
    SECURITY_RATE_LIMIT_HIT = 'security.rate_limit_hit'
}

/** Alias kept for readability at call sites and as a seam if the action type ever widens. */
export type AuditActionValue = AuditAction;

/*
 * See docs/tools/winston.md for field descriptions and examples.
 * snake_case field names (unlike the camelCase used elsewhere in the codebase) because these
 * are log *data*, consumed by SIEM/log tooling rather than by TypeScript callers.
 */
export interface IAuditEvent {
    /** Who acted. 'unknown' when unresolvable — never omitted, so queries can rely on it. */
    actor_user_id: string;
    /** Privilege level at the time of the action, so a later role change cannot rewrite history. */
    actor_role: 'admin' | 'user' | 'anonymous';
    /** What was attempted (see the enum above). */
    action: AuditActionValue;
    /** Whether it worked. Failures are the security-relevant half: repeated ones signal attack. */
    outcome: 'success' | 'failure';
    /** Source IP — the primary pivot when investigating an incident. */
    ip?: string;
    /** Client user-agent string; useful for spotting scripted traffic. */
    user_agent?: string;
    /** Per-request correlation id, links this entry to the application log lines. */
    request_id?: string;
    /** OTel trace id, links it to the distributed trace. */
    trace_id?: string;
    /** What was acted upon, e.g. 'product' — with `target_id`, the object of the action. */
    target_type?: string;
    target_id?: string;
    /** Action-specific extras. Anything here passes through the logger's redaction pipeline. */
    metadata?: Record<string, unknown>;
}

/*
 * Stored audit event — IAuditEvent enriched with timestamp and log level.
 * The two extra fields are added at emit time rather than being the caller's responsibility.
 */
export interface IAuditBufferEntry extends IAuditEvent {
    /** ISO-8601 emit time. */
    timestamp: string;
    /** Derived from `outcome`; retained so the buffer view matches what was logged. */
    level: 'info' | 'warn';
}

/*
 * In-memory ring buffer — max 200 entries, oldest evicted first.
 *
 * Purpose: let an admin endpoint show recent security activity without querying the log
 * backend. Two consequences worth being explicit about — it is per-process (with clustering,
 * each worker holds a different slice) and it dies with the process. The durable record is
 * the `auditLogger` output; this is a convenience view, never the source of truth.
 */
const AUDIT_BUFFER_MAX = 200;
const auditBuffer: IAuditBufferEntry[] = [];

/*
 * Emit a structured audit event. Failures use 'warn'; successes use 'info'.
 * Also appends to the in-memory ring buffer for admin inspection.
 * @param event - fully populated audit event (normally built by `buildAuditEvent`)
 */
export const emitAuditEvent = (event: IAuditEvent): void => {
    // Level mirrors the outcome, so an ops alert on `level: warn` in the audit stream picks up
    // failed logins and permission denials without needing to know the action vocabulary.
    const level = event.outcome === 'success' ? 'info' : ('warn' as const);
    // `logger.log(level, message, meta)` — the action doubles as the log message, and the whole
    // event object is attached as structured metadata.
    auditLogger.log(level, event.action, event);

    const entry: IAuditBufferEntry = { ...event, timestamp: new Date().toISOString(), level };
    // Evict from the front before pushing, keeping the buffer bounded — an unbounded array here
    // would be a slow memory leak in a long-running process.
    if (auditBuffer.length >= AUDIT_BUFFER_MAX) auditBuffer.shift();
    auditBuffer.push(entry);
};

/*
 * Return a snapshot of the ring buffer, most-recent-first.
 * The spread copies before reversing: `toReversed()` is already non-mutating, but the copy also
 * prevents a caller from mutating the live buffer through the returned reference.
 * @returns readonly array of buffered entries
 */
export const getAuditBuffer = (): Readonly<IAuditBufferEntry[]> => [...auditBuffer].toReversed();

/*
 * Extract common request fields (ip, user-agent, request-id, trace-id) for audit events.
 * @param request - minimal request shape
 * @returns partial IAuditEvent with context fields
 */
export const extractRequestContext = (request: {
    ip?: string;
    headers?: Record<string, string | string[] | undefined>;
    requestId?: string;
    // Structurally typed rather than `express.Request`: it keeps this callable from workers and
    // unit tests with a plain object literal, no Express instance required.
}): Pick<IAuditEvent, 'ip' | 'user_agent' | 'request_id' | 'trace_id'> => {
    const rawUserAgent = request.headers?.['user-agent'];
    return {
        // Note: `request.ip` reflects the proxy's address unless Express `trust proxy` is
        // configured — behind a load balancer that setting is what makes this field meaningful.
        ip: request.ip,
        // Node exposes repeated headers as an array; take the first rather than logging
        // '[object Object]'-style noise.
        user_agent: Array.isArray(rawUserAgent) ? rawUserAgent[0] : rawUserAgent,
        // Assigned by the request-id middleware.
        request_id: request.requestId,
        // Pulled from ambient OTel context, so audit entries join up with traces.
        trace_id: getActiveSpanContext().traceId
    };
};

/*
 * Resolve actor role from request auth context.
 * Returns 'admin', 'user', or 'anonymous'.
 * @param request - request with optional authContext
 * @returns actor role string
 */
export const resolveActorRole = (request: {
    authContext?: { admin?: boolean } | null;
}): IAuditEvent['actor_role'] => {
    // Order matters: most-privileged first, since an admin also satisfies the `user` check.
    if (request.authContext?.admin) return 'admin';
    // Context present but not admin → an authenticated regular user.
    if (request.authContext) return 'user';
    // No auth context at all: an unauthenticated request. Still audited — failed logins and
    // blocked access attempts are exactly the events worth keeping.
    return 'anonymous';
};

/*
 * Build a complete audit event from request context + action-specific fields.
 * Caller-provided actor_user_id / actor_role override the derived defaults.
 * @param request - Express-like request with auth context
 * @param fields - action, outcome, and optional overrides
 * @returns fully populated IAuditEvent
 */
export const buildAuditEvent = (
    request: {
        ip?: string;
        headers?: Record<string, string | string[] | undefined>;
        requestId?: string;
        authContext?: { id?: string; admin?: boolean } | null;
    },
    // The type says: `action` and `outcome` are mandatory, everything else optional. That is the
    // whole ergonomic point — a call site cannot forget what happened or whether it succeeded,
    // but never has to restate context the request already carries.
    fields: Pick<IAuditEvent, 'action' | 'outcome'> &
        Partial<
            Pick<
                IAuditEvent,
                'actor_user_id' | 'actor_role' | 'target_type' | 'target_id' | 'metadata'
            >
        >
): IAuditEvent => ({
    // Explicit override wins, then the authenticated user, then 'unknown'. The override matters
    // for failed logins, where there is no auth context but the *attempted* identity (the
    // submitted email) is the single most useful field in the record.
    actor_user_id: fields.actor_user_id ?? request.authContext?.id ?? 'unknown',
    actor_role: fields.actor_role ?? resolveActorRole(request),
    // Spread after the defaults so caller values replace them.
    ...fields,
    // Spread last, deliberately: request-derived context (ip, trace_id, ...) is not
    // caller-overridable, so an audit entry cannot misreport where it came from.
    ...extractRequestContext(request)
});
