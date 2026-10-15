/**
 * @module
 * What `forced: true` asks of a caller, and that a refusal for a missing `override:Order` leaves an
 * audit row: the route guard cannot see this check, so without it the 403 would be silent.
 */

import { registerAuditSink, type AuditEntry } from '@infrastructure/observability/audit';
import { callerContextAs } from '@tests/callers';
import { asReject } from '@tests/response';
import { refuseUnearnedForce } from '../../services/force';

/** The audit entries the registered sink received. */
const received: AuditEntry[] = [];

beforeEach(() => {
    received.length = 0;
    registerAuditSink((entry) => received.push(entry));
});

describe('refuseUnearnedForce', () => {
    it('asks nothing of a request that is not forced', () => {
        expect(
            refuseUnearnedForce(callerContextAs('warehouse'), undefined, undefined)
        ).toBeUndefined();
        expect(received).toEqual([]);
    });

    it('refuses 403 a forced move from a caller without override:Order, and audits it', () => {
        const refusal = refuseUnearnedForce(callerContextAs('warehouse', 'wh-1'), true, 'because');

        expect(asReject(refusal!).status).toBe(403);
        expect(received).toHaveLength(1);
        expect(received[0]).toMatchObject({
            action: 'security.forbidden',
            outcome: 'failure',
            actorUserId: 'wh-1',
            targetType: 'order',
            metadata: { reason: 'missing_permission', permission: 'override:Order' }
        });
    });

    it('asks a caller who holds override:Order for the reason, without an audit row', () => {
        const refusal = refuseUnearnedForce(callerContextAs('admin'), true, undefined);

        expect(asReject(refusal!).status).toBe(422);
        expect(received).toEqual([]);
    });

    it('lets a caller who holds override:Order and gives a reason through', () => {
        expect(
            refuseUnearnedForce(callerContextAs('admin'), true, 'carrier called')
        ).toBeUndefined();
    });
});
