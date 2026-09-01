import {
    emitAuditEvent,
    extractRequestContext,
    registerAuditSink,
    coreAuditActions,
    type AuditEvent,
    type AuditEntry
} from '@infrastructure/observability/audit';
import { auditLogger } from '@infrastructure/adapters/logger';

// Spy on auditLogger.log so we don't write to disk during tests.
jest.spyOn(auditLogger, 'log').mockImplementation(() => auditLogger);
jest.spyOn(auditLogger, 'warn').mockImplementation(() => auditLogger);

describe('coreAuditActions', () => {
    // Only the three actions core genuinely owns: this file is core's, and core does not know
    // which domains exist. Each module pins its OWN strings in
    // `src/modules/<name>/tests/unit/audit.test.ts`; the cross-cutting sweep proves the shape of
    // all of them without naming a domain.
    it('defines the app-level security actions', () => {
        expect(coreAuditActions.SECURITY_UNAUTHORIZED).toBe('security.unauthorized');
        expect(coreAuditActions.SECURITY_FORBIDDEN).toBe('security.forbidden');
        expect(coreAuditActions.SECURITY_RATE_LIMIT_HIT).toBe('security.rate_limit_hit');
    });
});

describe('emitAuditEvent', () => {
    beforeEach(() => jest.clearAllMocks());

    it('calls auditLogger.log with "info" level for success outcome', () => {
        const event: AuditEvent = {
            action: 'auth.login',
            actor_user_id: 'user-123',
            actor_role: 'user',
            outcome: 'success',
            ip: '1.2.3.4',
            request_id: 'req-abc'
        };

        emitAuditEvent(event);

        expect(auditLogger.log).toHaveBeenCalledTimes(1);
        const call = (auditLogger.log as jest.Mock).mock.calls[0] as [string, string, AuditEvent];
        expect(call[0]).toBe('info');
        expect(call[1]).toBe('auth.login');
        expect(call[2].actor_user_id).toBe('user-123');
        expect(call[2].outcome).toBe('success');
    });

    it('calls auditLogger.log with "warn" level for failure outcome', () => {
        const event: AuditEvent = {
            action: 'auth.login',
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
        const event: AuditEvent = {
            action: 'admin.user.erased',
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

        const call = (auditLogger.log as jest.Mock).mock.calls[0] as [string, string, AuditEvent];
        expect(call[2].action).toBe('admin.user.erased');
        expect(call[2].target_type).toBe('user');
        expect(call[2].target_id).toBe('user-789');
        expect(call[2].trace_id).toBe('trace-001');
        expect(call[2].metadata?.hardDelete).toBe(true);
    });

    it('uses "warn" level for security.unauthorized events', () => {
        emitAuditEvent({
            action: coreAuditActions.SECURITY_UNAUTHORIZED,
            actor_user_id: 'anonymous',
            actor_role: 'anonymous',
            outcome: 'failure'
        });

        const call = (auditLogger.log as jest.Mock).mock.calls[0] as [string, ...unknown[]];
        expect(call[0]).toBe('warn');
    });
});

describe('registerAuditSink', () => {
    beforeEach(() => jest.clearAllMocks());
    // Every test here registers a sink, and the module holds it in a closure — so each one puts
    // an inert sink back, or it would keep receiving the *next* test's events.
    afterEach(() => registerAuditSink(() => {}));

    const event: AuditEvent = {
        action: 'auth.login',
        actor_user_id: 'user-123',
        actor_role: 'user',
        outcome: 'success'
    };

    it('hands the emitted entry to the registered sink', () => {
        const sink = jest.fn();
        registerAuditSink(sink);

        emitAuditEvent(event);

        expect(sink).toHaveBeenCalledTimes(1);
        const entry = sink.mock.calls[0][0] as AuditEntry;
        expect(entry.action).toBe('auth.login');
        expect(entry.actor_user_id).toBe('user-123');
    });

    it('stamps the entry with a Date timestamp and the outcome-derived level', () => {
        const sink = jest.fn();
        registerAuditSink(sink);

        emitAuditEvent({ ...event, outcome: 'failure' });

        const entry = sink.mock.calls[0][0] as AuditEntry;
        // A Date, not an ISO string: the model stores it as a BSON date so the TTL index and the
        // `timestamp: -1` sort work on a real date rather than on lexicographic string order.
        expect(entry.timestamp).toBeInstanceOf(Date);
        expect(entry.level).toBe('warn');
    });

    it('still writes the log line when no sink is registered', () => {
        // The unregistered state is what unit tests and the queue workers run in — the compliance
        // record must not depend on persistence being wired up.
        registerAuditSink(() => {});
        emitAuditEvent(event);

        expect(auditLogger.log).toHaveBeenCalledTimes(1);
    });

    it('does not let a throwing sink escape into the caller', () => {
        // The property the whole audit path rests on: these run while answering requests, so a
        // broken sink must never turn a successful login into a 500.
        registerAuditSink(() => {
            throw new Error('mongo is down');
        });

        expect(() => emitAuditEvent(event)).not.toThrow();
        // The failure is reported rather than swallowed silently: the log line, then the warning.
        expect(auditLogger.log).toHaveBeenCalledTimes(1);
        expect(auditLogger.warn).toHaveBeenCalledWith(
            'audit.sink.failed',
            expect.objectContaining({ error: 'mongo is down' })
        );
    });
});

describe('extractRequestContext', () => {
    it('extracts ip, user_agent, and request_id', () => {
        const ctx = extractRequestContext({
            caller: {},
            ip: '10.0.0.1',
            userAgent: 'Mozilla/5.0',
            requestId: 'req-111'
        });

        expect(ctx.ip).toBe('10.0.0.1');
        expect(ctx.user_agent).toBe('Mozilla/5.0');
        expect(ctx.request_id).toBe('req-111');
        // trace_id comes from the active OTel span; undefined when no SDK is active in tests
        expect(ctx.trace_id).toBeUndefined();
    });

    it('returns undefined for missing fields', () => {
        const ctx = extractRequestContext({ caller: {} });

        expect(ctx.ip).toBeUndefined();
        expect(ctx.user_agent).toBeUndefined();
        expect(ctx.request_id).toBeUndefined();
        expect(ctx.trace_id).toBeUndefined();
    });
});
