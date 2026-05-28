import { auditLogger } from './winston';
import { getActiveSpanContext } from './tracer';

// Action constants — domain.resource.verb dot-notation.
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

export type AuditActionValue = AuditAction;

// See docs/tools/winston.md for field descriptions and examples.
export interface IAuditEvent {
    actor_user_id: string;
    actor_role: 'admin' | 'user' | 'anonymous';
    action: AuditActionValue;
    outcome: 'success' | 'failure';
    ip?: string;
    user_agent?: string;
    request_id?: string;
    trace_id?: string;
    target_type?: string;
    target_id?: string;
    metadata?: Record<string, unknown>;
}

/** Emit a structured audit event. Failures use 'warn'; successes use 'info'. */
export const emitAuditEvent = (event: IAuditEvent): void => {
    const level = event.outcome === 'success' ? 'info' : ('warn' as const);
    auditLogger.log(level, event.action, event);
};

/** Extract common request fields for audit events. */
export const extractRequestContext = (request: {
    ip?: string;
    headers?: Record<string, string | string[] | undefined>;
    requestId?: string;
}): Pick<IAuditEvent, 'ip' | 'user_agent' | 'request_id' | 'trace_id'> => {
    const rawUserAgent = request.headers?.['user-agent'];
    return {
        ip: request.ip,
        user_agent: Array.isArray(rawUserAgent) ? rawUserAgent[0] : rawUserAgent,
        request_id: request.requestId,
        trace_id: getActiveSpanContext().traceId
    };
};
