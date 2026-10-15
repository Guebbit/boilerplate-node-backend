import {
    auditForbidden,
    buildAuditEvent,
    emitAuditEvent,
    extractRequestContext,
    registerAuditSink,
    coreAuditActions,
    type AuditEvent,
    type AuditEntry
} from '@infrastructure/observability/audit';
import { auditLogger } from '@infrastructure/adapters/logger';
import { callerContextAs, strangerCaller, testCallerContext } from '../../../support/callers';

// Spy on auditLogger.log so we don't write to disk during tests.
jest.spyOn(auditLogger, 'log').mockImplementation(() => auditLogger);
jest.spyOn(auditLogger, 'warn').mockImplementation(() => auditLogger);

describe('coreAuditActions', () => {
    // Only the three actions core genuinely owns: this file is core's, and core does not know
    // which domains exist. Every module's own strings are read off `audit.ts` straight into
    // `docs/tools/winston.md`'s generated table; the cross-cutting sweep proves the shape of all
    // of them without naming a domain.
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
            actorUserId: 'user-123',
            actorRole: 'user',
            actorScope: 'tenant',
            outcome: 'success',
            ip: '1.2.3.4',
            requestId: 'req-abc'
        };

        emitAuditEvent(event);

        expect(auditLogger.log).toHaveBeenCalledTimes(1);
        const call = (auditLogger.log as jest.Mock).mock.calls[0] as [string, string, AuditEvent];
        expect(call[0]).toBe('info');
        expect(call[1]).toBe('auth.login');
        expect(call[2].actorUserId).toBe('user-123');
        expect(call[2].outcome).toBe('success');
    });

    it('calls auditLogger.log with "warn" level for failure outcome', () => {
        const event: AuditEvent = {
            action: 'auth.login',
            actorUserId: 'anonymous',
            actorRole: 'anonymous',
            actorScope: 'tenant',
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
            actorUserId: 'admin-456',
            actorRole: 'admin',
            actorScope: 'tenant',
            outcome: 'success',
            targetType: 'user',
            targetId: 'user-789',
            requestId: 'req-xyz',
            traceId: 'trace-001',
            metadata: { hardDelete: true }
        };

        emitAuditEvent(event);

        const call = (auditLogger.log as jest.Mock).mock.calls[0] as [string, string, AuditEvent];
        expect(call[2].action).toBe('admin.user.erased');
        expect(call[2].targetType).toBe('user');
        expect(call[2].targetId).toBe('user-789');
        expect(call[2].traceId).toBe('trace-001');
        expect(call[2].metadata?.hardDelete).toBe(true);
    });

    it('uses "warn" level for security.unauthorized events', () => {
        emitAuditEvent({
            action: coreAuditActions.SECURITY_UNAUTHORIZED,
            actorUserId: 'anonymous',
            actorRole: 'anonymous',
            actorScope: 'tenant',
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
        actorUserId: 'user-123',
        actorRole: 'user',
        actorScope: 'tenant',
        outcome: 'success'
    };

    it('hands the emitted entry to the registered sink', () => {
        const sink = jest.fn();
        registerAuditSink(sink);

        emitAuditEvent(event);

        expect(sink).toHaveBeenCalledTimes(1);
        const entry = sink.mock.calls[0][0] as AuditEntry;
        expect(entry.action).toBe('auth.login');
        expect(entry.actorUserId).toBe('user-123');
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
        const failure = new Error('mongo is down');
        registerAuditSink(() => {
            throw failure;
        });

        expect(() => emitAuditEvent(event)).not.toThrow();
        // The failure is reported rather than swallowed silently: the log line, then the warning.
        expect(auditLogger.log).toHaveBeenCalledTimes(1);
        // The Error itself, not its message: `redactFormat` hands anything under `error` to
        // `serializeError`, which keeps the name and — outside production — the stack.
        expect(auditLogger.warn).toHaveBeenCalledWith(
            'audit.sink.failed',
            expect.objectContaining({ error: failure })
        );
    });
});

describe('extractRequestContext', () => {
    it('extracts ip, userAgent, and requestId', () => {
        const ctx = extractRequestContext({
            caller: strangerCaller(),
            ip: '10.0.0.1',
            userAgent: 'Mozilla/5.0',
            requestId: 'req-111',
            analyticsConsent: false
        });

        expect(ctx.ip).toBe('10.0.0.1');
        expect(ctx.userAgent).toBe('Mozilla/5.0');
        expect(ctx.requestId).toBe('req-111');
        // traceId comes from the active OTel span; undefined when no SDK is active in tests
        expect(ctx.traceId).toBeUndefined();
    });

    it('returns undefined for missing fields', () => {
        const ctx = extractRequestContext({ caller: strangerCaller(), analyticsConsent: false });

        expect(ctx.ip).toBeUndefined();
        expect(ctx.userAgent).toBeUndefined();
        expect(ctx.requestId).toBeUndefined();
        expect(ctx.traceId).toBeUndefined();
    });
});

describe("buildAuditEvent — the caller's own request id", () => {
    it('records it in metadata, beside whatever metadata the call site gave', () => {
        const event = buildAuditEvent(
            { ...testCallerContext, clientRequestId: 'client-id-1' },
            { action: 'auth.login', outcome: 'success', metadata: { route: '/x' } }
        );

        expect(event.metadata).toEqual({ route: '/x', clientRequestId: 'client-id-1' });
    });

    it('adds no metadata when the caller sent none', () => {
        const event = buildAuditEvent(testCallerContext, {
            action: 'auth.login',
            outcome: 'success'
        });

        expect(event).not.toHaveProperty('metadata');
    });
});

describe('buildAuditEvent — default actorRole', () => {
    it('reports anonymous for a caller with no id', () => {
        const event = buildAuditEvent(testCallerContext, {
            action: 'auth.login',
            outcome: 'failure'
        });

        expect(event.actorRole).toBe('anonymous');
    });

    it('reports user for an authenticated caller that holds only some keys', () => {
        const event = buildAuditEvent(callerContextAs('customer', 'customer-1'), {
            action: 'auth.login',
            outcome: 'success'
        });

        expect(event.actorRole).toBe('user');
    });

    // The fix this guards: before `unrestricted` was carried on `Caller`, `resolveActorRole`
    // could only tell an authenticated caller from an anonymous one — an admin action whose call
    // site passed no explicit `actorRole` was logged as `user` alongside everybody else's.
    it('reports admin for a caller holding every key its scope declares', () => {
        const event = buildAuditEvent(callerContextAs('admin', 'admin-1'), {
            action: 'admin.user.erased',
            outcome: 'success'
        });

        expect(event.actorRole).toBe('admin');
    });

    // `SYSTEM_ACTOR` is unrestricted too, exactly like `admin` — this must be checked FIRST,
    // or a background job's own action reads as an admin's. `id: 'system'` is what `Caller.system`
    // is computed from (`kernel/permissions.ts`'s `assembleCaller`).
    it('reports system for the system actor, never admin, though both are unrestricted', () => {
        const event = buildAuditEvent(callerContextAs('system', 'system'), {
            action: 'auth.login',
            outcome: 'success'
        });

        expect(event.actorRole).toBe('system');
    });
});

describe('auditForbidden', () => {
    /** The entries a registered sink received. */
    const received: AuditEntry[] = [];

    beforeEach(() => {
        received.length = 0;
        registerAuditSink((entry) => received.push(entry));
    });

    it('records a failed security.forbidden row naming the target and why', () => {
        auditForbidden(callerContextAs('manager', 'manager-1'), {
            targetType: 'order',
            targetId: 'order-9',
            metadata: { reason: 'missing_permission', permission: 'override:Order' }
        });

        expect(received).toHaveLength(1);
        expect(received[0]).toMatchObject({
            action: coreAuditActions.SECURITY_FORBIDDEN,
            outcome: 'failure',
            level: 'warn',
            actorUserId: 'manager-1',
            targetType: 'order',
            targetId: 'order-9',
            metadata: { reason: 'missing_permission', permission: 'override:Order' }
        });
    });

    it('leaves the target id out when the refusal does not know it', () => {
        auditForbidden(callerContextAs('manager', 'manager-1'), {
            targetType: 'product',
            metadata: { reason: 'missing_permission' }
        });

        expect(received[0]).not.toHaveProperty('targetId');
    });

    it('is a no-op on a path with no request behind it', () => {
        auditForbidden(undefined, { targetType: 'order', metadata: { reason: 'x' } });

        expect(received).toEqual([]);
    });
});
