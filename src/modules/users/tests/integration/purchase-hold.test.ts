/**
 * @module
 * The purchase hold on the user record: the two staff doors, the shop's own atomic door, what the
 * wire shows while one is in force, and the audit row each write leaves.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { observePort } from '@tests/ports';
import { callerContextAs, testCallerContext } from '@tests/callers';
import * as auditPort from '@infrastructure/observability/audit';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import type { ResponseReject } from '@infrastructure/http/response';
import { userService } from '@modules/users/services';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { reapExpiredPurchaseHolds } from '../../services/purchase-hold';
import { usersAuditActions } from '../../audit';

// The audit port is replaced, not spied on — see `tests/support/ports.ts`.
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

// The queue, not the copy.
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

beforeEach(() => {
    mockEnqueueEmail.mockReset();
    // The buyer mail chains a `.catch` on the queue's promise, like the contact form's.
    mockEnqueueEmail.mockResolvedValue(undefined);
});

/** The mails queued to the buyer about a hold. */
const holdMails = () =>
    mockEnqueueEmail.mock.calls.filter(([, template]) => template === 'users.purchase-hold-placed');

const DAY = 24 * 60 * 60 * 1000;

/** The rule behind an automatic hold, as the buyer's mail states it. */
const AUTOMATIC_BASIS = { cancelCount: 3, windowDays: 7 };

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
            testCallerContext,
            AUTOMATIC_BASIS
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
            userService.takeAutomaticPurchaseHold(
                buyer.id,
                inDays(2),
                testCallerContext,
                AUTOMATIC_BASIS
            ),
            userService.takeAutomaticPurchaseHold(
                buyer.id,
                inDays(3),
                testCallerContext,
                AUTOMATIC_BASIS
            )
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
            testCallerContext,
            AUTOMATIC_BASIS
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
            testCallerContext,
            AUTOMATIC_BASIS
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

/**
 * The `profile` section as the export writes it: the stored account, serialised whole, so the
 * model's own `toJSON` is what decides what leaves.
 *
 * @param id - the account
 */
const exportedProfile = (id: string): Promise<{ purchaseHold?: object }> =>
    userService
        .findByIdWithCredentials(id)
        // The export writes `JSON.stringify(section)`: this is that, read back, because the
        // `toJSON` transform runs only in the stringify (`structuredClone` would skip it).
        // eslint-disable-next-line unicorn/prefer-structured-clone -- structuredClone bypasses toJSON, which is the thing under test
        .then((profile) => JSON.parse(JSON.stringify(profile)) as { purchaseHold?: object });

describe('the buyer mail when a hold is placed', () => {
    it('mails the buyer a staff hold: until when, the note, a way to ask a person, the right to object', async () => {
        const buyer = await createUser({ email: 'held@owner.test', username: 'held' });
        const until = inDays(3);

        await userService.setPurchaseHold(
            buyer.id,
            { until, note: 'Please write to us about your recent orders.' },
            callerContextAs('moderator')
        );

        expect(holdMails()).toHaveLength(1);
        const [recipient, , data] = holdMails()[0];
        expect(recipient).toMatchObject({ to: 'held@owner.test' });
        expect(data).toMatchObject({
            note: 'Please write to us about your recent orders.',
            reason: expect.stringContaining('member of our team'),
            contactUrl: expect.stringContaining('contact?category=account'),
            privacyUrl: expect.stringContaining('/privacy')
        });
        // The right to object is its own paragraph, apart from the reason.
        expect(data).toMatchObject({ objection: expect.stringContaining('Article 21') });
        expect(JSON.stringify(data)).not.toContain('moderator');
    });

    it('mails an automatic hold with the rule that caused it, in the buyer’s language', async () => {
        const buyer = await createUser({ email: 'it@owner.test', username: 'it', locale: 'it' });

        await userService.takeAutomaticPurchaseHold(
            buyer.id,
            inDays(4),
            testCallerContext,
            AUTOMATIC_BASIS
        );

        expect(holdMails()).toHaveLength(1);
        const data = holdMails()[0][2];
        expect(data).toMatchObject({
            locale: 'it',
            reason: expect.stringContaining('3 tuoi ordini'),
            summary: expect.stringMatching(/fino al .*UTC/),
            note: ''
        });
        expect((data as { contactUrl: string }).contactUrl).toContain('/it/');
    });

    it('mails once when two automatic calls race to the limit', async () => {
        const buyer = await createUser();

        await Promise.all([
            userService.takeAutomaticPurchaseHold(
                buyer.id,
                inDays(2),
                testCallerContext,
                AUTOMATIC_BASIS
            ),
            userService.takeAutomaticPurchaseHold(
                buyer.id,
                inDays(3),
                testCallerContext,
                AUTOMATIC_BASIS
            )
        ]);

        expect(holdMails()).toHaveLength(1);
    });

    it('never undoes the hold when the mail cannot be queued', async () => {
        mockEnqueueEmail.mockRejectedValue(new Error('smtp down'));
        const buyer = await createUser();

        const result = await userService.setPurchaseHold(
            buyer.id,
            { until: inDays(2) },
            callerContextAs('moderator')
        );

        expect(result.success).toBe(true);
        await expect(userService.purchaseHoldOf(buyer.id)).resolves.toMatchObject({
            reason: 'staff'
        });
    });

    it('sends nothing for a refused hold, a lift, or an automatic call that lost the race', async () => {
        const buyer = await createUser();
        await userService.setPurchaseHold(
            buyer.id,
            { until: inDays(-1) },
            callerContextAs('moderator')
        );
        await userService.liftPurchaseHold(buyer.id, callerContextAs('moderator'));
        await userService.setPurchaseHold(
            buyer.id,
            { until: inDays(5) },
            callerContextAs('moderator')
        );
        mockEnqueueEmail.mockClear();

        const taken = await userService.takeAutomaticPurchaseHold(
            buyer.id,
            inDays(1),
            testCallerContext,
            AUTOMATIC_BASIS
        );

        expect(taken).toBe(false);
        expect(holdMails()).toHaveLength(0);
    });
});

describe('what the data export carries', () => {
    it('carries a hold in force, without the staff member who set it', async () => {
        const buyer = await createUser();
        await userService.setPurchaseHold(
            buyer.id,
            { until: inDays(2), note: 'Please contact us.' },
            callerContextAs('moderator', 'staff-9')
        );

        const profile = await exportedProfile(buyer.id);

        expect(profile.purchaseHold).toMatchObject({ reason: 'staff', note: 'Please contact us.' });
        expect(JSON.stringify(profile)).not.toContain('staff-9');
        expect(profile.purchaseHold).not.toHaveProperty('setBy');
    });

    it('carries an expired hold until the nightly sweep reduces it, still without who set it', async () => {
        const buyer = await createUser({
            purchaseHold: {
                until: inDays(-1),
                reason: 'staff',
                setBy: 'staff-9',
                setAt: inDays(-3)
            }
        });

        const profile = await exportedProfile(buyer.id);

        expect(profile.purchaseHold).toMatchObject({ reason: 'staff' });
        expect(profile.purchaseHold).not.toHaveProperty('setBy');
    });

    it('keeps who set a hold in the stored record, for the audit trail', async () => {
        const buyer = await createUser();
        await userService.setPurchaseHold(
            buyer.id,
            { until: inDays(2) },
            callerContextAs('moderator', 'staff-9')
        );

        const stored = await userRepository.findById(buyer.id);

        expect(stored?.purchaseHold?.setBy).toBe('staff-9');
    });
});

describe('reapExpiredPurchaseHolds', () => {
    it('reduces an expired hold to the date that restarts the count, dropping the rest', async () => {
        const setAt = inDays(-8);
        const buyer = await createUser({
            purchaseHold: {
                until: inDays(-1),
                reason: 'staff',
                note: 'Please contact us.',
                setBy: 'staff-9',
                setAt
            }
        });

        await expect(reapExpiredPurchaseHolds()).resolves.toBe(1);

        const stored = await userRepository.findById(buyer.id);
        expect(stored?.purchaseHold).toBeUndefined();
        expect(stored?.purchaseHoldResetAt).toEqual(setAt);
    });

    it('leaves a hold in force untouched', async () => {
        const buyer = await createUser();
        await userService.setPurchaseHold(
            buyer.id,
            { until: inDays(2), note: 'Still in force.' },
            callerContextAs('moderator', 'staff-9')
        );

        await expect(reapExpiredPurchaseHolds()).resolves.toBe(0);

        const stored = await userRepository.findById(buyer.id);
        expect(stored?.purchaseHold).toMatchObject({ note: 'Still in force.', setBy: 'staff-9' });
    });

    it('keeps the account’s own mark when it is later than the hold’s', async () => {
        const liftedAt = inDays(-2);
        const buyer = await createUser({
            purchaseHold: { until: inDays(-1), reason: 'staff', setAt: inDays(-8) },
            purchaseHoldResetAt: liftedAt
        });

        await reapExpiredPurchaseHolds();

        const stored = await userRepository.findById(buyer.id);
        expect(stored?.purchaseHoldResetAt).toEqual(liftedAt);
    });

    it('does not make the count start over: cancellations before the hold stay answered', async () => {
        const setAt = inDays(-8);
        const buyer = await createUser({
            purchaseHold: { until: inDays(-1), reason: 'repeated_cancellations', setAt }
        });
        const before = await userService.purchaseHoldCountingSince(buyer.id);

        await reapExpiredPurchaseHolds();

        await expect(userService.purchaseHoldCountingSince(buyer.id)).resolves.toEqual(before);
        await expect(userService.purchaseHoldCountingSince(buyer.id)).resolves.toEqual(setAt);
    });

    it('is safe to repeat', async () => {
        await createUser({
            purchaseHold: { until: inDays(-1), reason: 'staff', setAt: inDays(-3) }
        });

        await expect(reapExpiredPurchaseHolds()).resolves.toBe(1);
        await expect(reapExpiredPurchaseHolds()).resolves.toBe(0);
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
