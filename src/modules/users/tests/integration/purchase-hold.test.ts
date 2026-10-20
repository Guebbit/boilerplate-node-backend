/**
 * @module
 * The purchase hold on the user record: the two staff doors, the shop's own atomic door, what the
 * wire shows while one is in force, and the audit row each write leaves.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { observePort } from '@tests/ports';
import { callerContextAs, testCallerContext } from '@tests/callers';
import * as auditPort from '@infrastructure/observability/audit';
import type { ResponseReject } from '@infrastructure/http/response';
import { userService } from '@modules/users/services';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { usersAuditActions } from '../../audit';

// The audit port is replaced, not spied on — see `tests/support/ports.ts`.
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

setupTestDb();

const DAY = 24 * 60 * 60 * 1000;

/** `days` from now. */
const inDays = (days: number): Date => new Date(Date.now() + days * DAY);

/** The audit rows written so far, as `{ action }` matchers read them. */
const auditedAction = (action: string) => expect.objectContaining({ action });

describe('setPurchaseHold', () => {
    it('stores a manual hold with its note, readable while in force', async () => {
        const buyer = await createUser();
        const until = inDays(3);

        const result = await userService.setPurchaseHold(
            buyer.id,
            { until, note: '  Please write to us about your recent orders.  ' },
            callerContextAs('moderator', 'staff-1')
        );

        expect(result.success).toBe(true);
        await expect(userService.purchaseHoldOf(buyer.id)).resolves.toMatchObject({
            until,
            reason: 'staff',
            note: 'Please write to us about your recent orders.'
        });
        const stored = await userRepository.findById(buyer.id);
        expect(stored?.purchaseHold?.setBy).toBe('staff-1');
    });

    it('refuses an end date in the past with a 422 naming the field, and stores nothing', async () => {
        const buyer = await createUser();

        const result = await userService.setPurchaseHold(
            buyer.id,
            { until: inDays(-1) },
            callerContextAs('moderator')
        );

        expect(result.success).toBe(false);
        expect((result as ResponseReject).status).toBe(422);
        expect((result as ResponseReject).errors[0]?.details).toMatchObject({ field: 'until' });
        await expect(userService.purchaseHoldOf(buyer.id)).resolves.toBeUndefined();
    });

    it('answers 404 for an account that does not exist', async () => {
        const result = await userService.setPurchaseHold(
            '000000000000000000000000',
            { until: inDays(1) },
            callerContextAs('moderator')
        );

        expect((result as ResponseReject).status).toBe(404);
    });

    it('refuses a staff account to a caller who may not manage it', async () => {
        const target = await createUser({ email: 'mod@owner.test', username: 'mod' }, 'moderator');

        const result = await userService.setPurchaseHold(
            target.id,
            { until: inDays(1) },
            callerContextAs('support')
        );

        expect((result as ResponseReject).errors[0]?.code).toBe('ROLE_MANAGEMENT_REQUIRED');
        await expect(userService.purchaseHoldOf(target.id)).resolves.toBeUndefined();
    });

    it('audits the write', async () => {
        const recorded = observePort(auditPort.emitAuditEvent);
        const buyer = await createUser();

        await userService.setPurchaseHold(
            buyer.id,
            { until: inDays(2) },
            callerContextAs('moderator')
        );

        expect(recorded).toHaveBeenCalledWith(
            auditedAction(usersAuditActions.ADMIN_USER_PURCHASE_HOLD_SET)
        );
    });
});

describe('liftPurchaseHold', () => {
    it('ends a hold in force, restarts the count, and audits it', async () => {
        const recorded = observePort(auditPort.emitAuditEvent);
        const buyer = await createUser();
        await userService.setPurchaseHold(
            buyer.id,
            { until: inDays(5) },
            callerContextAs('moderator')
        );

        const result = await userService.liftPurchaseHold(buyer.id, callerContextAs('moderator'));

        expect(result.success).toBe(true);
        await expect(userService.purchaseHoldOf(buyer.id)).resolves.toBeUndefined();
        await expect(userService.purchaseHoldCountingSince(buyer.id)).resolves.toBeInstanceOf(Date);
        expect(recorded).toHaveBeenCalledWith(
            auditedAction(usersAuditActions.ADMIN_USER_PURCHASE_HOLD_LIFTED)
        );
    });

    it('is safe to repeat, and audits a lift only when a hold was in force', async () => {
        const recorded = observePort(auditPort.emitAuditEvent);
        const buyer = await createUser();

        const result = await userService.liftPurchaseHold(buyer.id, callerContextAs('moderator'));

        expect(result.success).toBe(true);
        expect(recorded).not.toHaveBeenCalledWith(
            auditedAction(usersAuditActions.ADMIN_USER_PURCHASE_HOLD_LIFTED)
        );
    });

    it('answers 404 for an account that does not exist', async () => {
        const result = await userService.liftPurchaseHold(
            '000000000000000000000000',
            callerContextAs('moderator')
        );

        expect((result as ResponseReject).status).toBe(404);
    });
});

describe('takeAutomaticPurchaseHold', () => {
    it('takes a hold on an account that has none, and audits it as the system', async () => {
        const recorded = observePort(auditPort.emitAuditEvent);
        const buyer = await createUser();
        const until = inDays(4);

        const taken = await userService.takeAutomaticPurchaseHold(
            buyer.id,
            until,
            testCallerContext
        );

        expect(taken).toBe(true);
        await expect(userService.purchaseHoldOf(buyer.id)).resolves.toMatchObject({
            until,
            reason: 'repeated_cancellations'
        });
        expect(recorded).toHaveBeenCalledWith(
            auditedAction(usersAuditActions.SYSTEM_USER_PURCHASE_HOLD_SET)
        );
    });

    it('lets exactly one of two racing calls win', async () => {
        const buyer = await createUser();

        const outcomes = await Promise.all([
            userService.takeAutomaticPurchaseHold(buyer.id, inDays(2), testCallerContext),
            userService.takeAutomaticPurchaseHold(buyer.id, inDays(3), testCallerContext)
        ]);

        expect(outcomes.filter(Boolean)).toHaveLength(1);
    });

    it('does not replace a manual hold still in force', async () => {
        const buyer = await createUser();
        await userService.setPurchaseHold(
            buyer.id,
            { until: inDays(10), note: 'staff review' },
            callerContextAs('moderator')
        );

        const taken = await userService.takeAutomaticPurchaseHold(
            buyer.id,
            inDays(1),
            testCallerContext
        );

        expect(taken).toBe(false);
        await expect(userService.purchaseHoldOf(buyer.id)).resolves.toMatchObject({
            reason: 'staff',
            note: 'staff review'
        });
    });

    it('takes a new hold once the earlier one has ended', async () => {
        const buyer = await createUser({
            purchaseHold: {
                until: inDays(-1),
                reason: 'repeated_cancellations',
                setAt: inDays(-8)
            }
        });

        const taken = await userService.takeAutomaticPurchaseHold(
            buyer.id,
            inDays(2),
            testCallerContext
        );

        expect(taken).toBe(true);
    });
});

describe('what the wire shows', () => {
    it('shows a hold in force to the buyer without who set it', async () => {
        const buyer = await createUser();
        await userService.setPurchaseHold(
            buyer.id,
            { until: inDays(2), note: 'Please contact us.' },
            callerContextAs('moderator', 'staff-9')
        );
        const stored = await userRepository.findById(buyer.id);

        const wire = userService.toUser(stored!, null);

        expect(wire.purchaseHold).toMatchObject({ reason: 'staff', note: 'Please contact us.' });
        expect(JSON.stringify(wire)).not.toContain('staff-9');
    });

    it('leaves out a hold that has ended', async () => {
        const buyer = await createUser({
            purchaseHold: { until: inDays(-1), reason: 'staff', setAt: inDays(-3) }
        });
        const stored = await userRepository.findById(buyer.id);

        expect(userService.toUser(stored!, null).purchaseHold).toBeUndefined();
    });
});

describe('the users list filter', () => {
    it('lists only the accounts under a hold right now', async () => {
        const held = await createUser({ email: 'held@owner.test', username: 'held' });
        await createUser({ email: 'free@owner.test', username: 'free' });
        await createUser({
            email: 'ended@owner.test',
            username: 'ended',
            purchaseHold: { until: inDays(-1), reason: 'staff', setAt: inDays(-3) }
        });
        await userService.setPurchaseHold(
            held.id,
            { until: inDays(2) },
            callerContextAs('moderator')
        );

        const { items } = await userService.search({ purchaseHold: true });

        expect(items.map((row) => row.email)).toEqual(['held@owner.test']);
    });
});
