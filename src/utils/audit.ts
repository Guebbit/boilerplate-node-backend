import { auditLogger } from './winston';

// ─── Action name constants ───────────────────────────────────────────────────
// Follow domain.resource.verb dot-notation.

export enum AuditAction {
    // Auth
    AUTH_LOGIN_SUCCEEDED = 'auth.login.succeeded',
    AUTH_LOGIN_FAILED = 'auth.login.failed',
    AUTH_SIGNUP_SUCCEEDED = 'auth.signup.succeeded',
    AUTH_SIGNUP_FAILED = 'auth.signup.failed',
    AUTH_PASSWORD_RESET_REQUESTED = 'auth.password_reset.requested',
    AUTH_PASSWORD_RESET_COMPLETED = 'auth.password_reset.completed',
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

    // Security / access-control
    SECURITY_UNAUTHORIZED = 'security.unauthorized',
    SECURITY_FORBIDDEN = 'security.forbidden',
    SECURITY_RATE_LIMIT_HIT = 'security.rate_limit_hit',
}

export type AuditActionValue = AuditAction;

// ─── Formal audit event schema ───────────────────────────────────────────────
// See docs/guide/audit-logging.md for field descriptions and examples.

export interface IAuditEvent {
    /** User ID of the actor, or 'anonymous' for unauthenticated requests. */
    actor_user_id: string;
    /** Role of the actor. */
    actor_role: 'admin' | 'user' | 'anonymous';
    /** Action name — dot-notation: domain.resource.verb. */
    action: AuditActionValue;
    /** Whether the action succeeded or failed. */
    outcome: 'success' | 'failure';
    /** Client IP address. */
    ip?: string;
    /** User-Agent header value. */
    user_agent?: string;
    /** x-request-id correlation ID. */
    request_id?: string;
    /** OTel trace ID for cross-signal correlation. */
    trace_id?: string;
    /** Resource type e.g. 'user', 'product', 'order'. */
    target_type?: string;
    /** ID of the affected resource. */
    target_id?: string;
    /** Additional non-sensitive context. */
    metadata?: Record<string, unknown>;
}

// ─── Emit helper ─────────────────────────────────────────────────────────────

/**
 * Emit a structured audit event.
 * Failures and security blocks use 'warn'; successful actions use 'info'.
 */
export const emitAuditEvent = (event: IAuditEvent): void => {
    const level = event.outcome === 'success' ? 'info' : 'warn';
    auditLogger.log(level, event.action, event);
};

// ─── Request context helper ───────────────────────────────────────────────────

/**
 * Extract common request fields for audit events.
 * Accepts any object with the expected optional properties.
 */
export const extractRequestContext = (request: {
    ip?: string;
    headers?: Record<string, string | string[] | undefined>;
    requestId?: string;
    traceContext?: { traceId?: string };
}): Pick<IAuditEvent, 'ip' | 'user_agent' | 'request_id' | 'trace_id'> => {
    const rawUserAgent = request.headers?.['user-agent'];
    return {
        ip: request.ip,
        user_agent: Array.isArray(rawUserAgent) ? rawUserAgent[0] : rawUserAgent,
        request_id: request.requestId,
        trace_id: request.traceContext?.traceId,
    };
};
