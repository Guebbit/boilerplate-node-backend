import { emitAuditEvent, extractRequestContext, AuditAction, IAuditEvent } from '@utils/audit';
import { auditLogger } from '@utils/winston';

// Spy on auditLogger.log so we don't write to disk during tests.
jest.spyOn(auditLogger, 'log').mockImplementation(() => auditLogger);

describe('AuditAction constants', () => {
    it('defines all required auth action keys', () => {
        expect(AuditAction.AUTH_LOGIN_SUCCEEDED).toBe('auth.login.succeeded');
        expect(AuditAction.AUTH_LOGIN_FAILED).toBe('auth.login.failed');
        expect(AuditAction.AUTH_SIGNUP_SUCCEEDED).toBe('auth.signup.succeeded');
        expect(AuditAction.AUTH_SIGNUP_FAILED).toBe('auth.signup.failed');
        expect(AuditAction.AUTH_PASSWORD_RESET_REQUESTED).toBe('auth.password_reset.requested');
        expect(AuditAction.AUTH_PASSWORD_RESET_COMPLETED).toBe('auth.password_reset.completed');
        expect(AuditAction.AUTH_REFRESH_SUCCEEDED).toBe('auth.refresh.succeeded');
        expect(AuditAction.AUTH_REFRESH_FAILED).toBe('auth.refresh.failed');
        expect(AuditAction.AUTH_LOGOUT_ALL_SUCCEEDED).toBe('auth.logout_all.succeeded');
        expect(AuditAction.AUTH_TOKEN_EXPIRED_CLEANUP).toBe('auth.token.expired_cleanup');
    });

    it('defines all required admin action keys', () => {
        expect(AuditAction.ADMIN_USER_CREATED).toBe('admin.user.created');
        expect(AuditAction.ADMIN_USER_UPDATED).toBe('admin.user.updated');
        expect(AuditAction.ADMIN_USER_DELETED).toBe('admin.user.deleted');
        expect(AuditAction.ADMIN_PRODUCT_CREATED).toBe('admin.product.created');
        expect(AuditAction.ADMIN_PRODUCT_UPDATED).toBe('admin.product.updated');
        expect(AuditAction.ADMIN_PRODUCT_DELETED).toBe('admin.product.deleted');
        expect(AuditAction.ADMIN_ORDER_CREATED).toBe('admin.order.created');
        expect(AuditAction.ADMIN_ORDER_UPDATED).toBe('admin.order.updated');
        expect(AuditAction.ADMIN_ORDER_DELETED).toBe('admin.order.deleted');
    });

    it('defines all required security action keys', () => {
        expect(AuditAction.SECURITY_UNAUTHORIZED).toBe('security.unauthorized');
        expect(AuditAction.SECURITY_FORBIDDEN).toBe('security.forbidden');
        expect(AuditAction.SECURITY_RATE_LIMIT_HIT).toBe('security.rate_limit_hit');
    });
});

describe('emitAuditEvent', () => {
    beforeEach(() => jest.clearAllMocks());

    it('calls auditLogger.log with "info" level for success outcome', () => {
        const event: IAuditEvent = {
            action: AuditAction.AUTH_LOGIN_SUCCEEDED,
            actor_user_id: 'user-123',
            actor_role: 'user',
            outcome: 'success',
            ip: '1.2.3.4',
            request_id: 'req-abc'
        };

        emitAuditEvent(event);

        expect(auditLogger.log).toHaveBeenCalledTimes(1);
        const call = (auditLogger.log as jest.Mock).mock.calls[0] as [string, string, IAuditEvent];
        expect(call[0]).toBe('info');
        expect(call[1]).toBe('auth.login.succeeded');
        expect(call[2].actor_user_id).toBe('user-123');
        expect(call[2].outcome).toBe('success');
    });

    it('calls auditLogger.log with "warn" level for failure outcome', () => {
        const event: IAuditEvent = {
            action: AuditAction.AUTH_LOGIN_FAILED,
            actor_user_id: 'anonymous',
            actor_role: 'anonymous',
            outcome: 'failure',
            ip: '1.2.3.4'
        };

        emitAuditEvent(event);

        const call = (auditLogger.log as jest.Mock).mock.calls[0] as [string, ...unknown[]];
        expect(call[0]).toBe('warn');
    });

    it('passes all event fields through to the logger', () => {
        const event: IAuditEvent = {
            action: AuditAction.ADMIN_USER_DELETED,
            actor_user_id: 'admin-456',
            actor_role: 'admin',
            outcome: 'success',
            target_type: 'user',
            target_id: 'user-789',
            request_id: 'req-xyz',
            trace_id: 'trace-001',
            metadata: { hardDelete: true }
        };

        emitAuditEvent(event);

        const call = (auditLogger.log as jest.Mock).mock.calls[0] as [string, string, IAuditEvent];
        expect(call[2].action).toBe('admin.user.deleted');
        expect(call[2].target_type).toBe('user');
        expect(call[2].target_id).toBe('user-789');
        expect(call[2].trace_id).toBe('trace-001');
        expect(call[2].metadata?.hardDelete).toBe(true);
    });

    it('uses "warn" level for security.unauthorized events', () => {
        emitAuditEvent({
            action: AuditAction.SECURITY_UNAUTHORIZED,
            actor_user_id: 'anonymous',
            actor_role: 'anonymous',
            outcome: 'failure'
        });

        const call = (auditLogger.log as jest.Mock).mock.calls[0] as [string, ...unknown[]];
        expect(call[0]).toBe('warn');
    });
});

describe('extractRequestContext', () => {
    it('extracts ip, user_agent, and request_id', () => {
        const mockHeaders: Record<string, string | string[] | undefined> = {
            ['user-agent']: 'Mozilla/5.0'
        };
        const request = {
            ip: '10.0.0.1',
            headers: mockHeaders,
            requestId: 'req-111'
        };

        const ctx = extractRequestContext(request);

        expect(ctx.ip).toBe('10.0.0.1');
        expect(ctx.user_agent).toBe('Mozilla/5.0');
        expect(ctx.request_id).toBe('req-111');
        // trace_id comes from the active OTel span; undefined when no SDK is active in tests
        expect(ctx.trace_id).toBeUndefined();
    });

    it('returns undefined for missing fields', () => {
        const ctx = extractRequestContext({});

        expect(ctx.ip).toBeUndefined();
        expect(ctx.user_agent).toBeUndefined();
        expect(ctx.request_id).toBeUndefined();
        expect(ctx.trace_id).toBeUndefined();
    });

    it('normalizes array user-agent to first element', () => {
        const mockHeaders: Record<string, string | string[] | undefined> = {
            ['user-agent']: ['agent-a', 'agent-b']
        };
        const ctx = extractRequestContext({ headers: mockHeaders });
        expect(ctx.user_agent).toBe('agent-a');
    });

    it('handles missing headers object', () => {
        const ctx = extractRequestContext({ ip: '9.9.9.9' });
        expect(ctx.ip).toBe('9.9.9.9');
        expect(ctx.user_agent).toBeUndefined();
    });
});
