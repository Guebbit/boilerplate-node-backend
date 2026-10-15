import {
    registerAuditSink,
    coreAuditActions,
    type AuditEntry
} from '@infrastructure/observability/audit';
import { auditForbidden } from '@infrastructure/observability/forbidden';
import { auditLogger } from '@infrastructure/adapters/logger';
import { callerContextAs } from '../../../support/callers';

// Spy on auditLogger.log so we don't write to disk during tests.
jest.spyOn(auditLogger, 'log').mockImplementation(() => auditLogger);

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
