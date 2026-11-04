/**
 * @module
 * The shop's work notices, driven the way production drives them: the real modules registered, a
 * shop event at one end, the bell of each member at the other. Proves who is told (the sets, the
 * unrestricted roles, only accounts that can act), that a redelivery tells nobody twice, and that
 * mail follows the route's class. The engine's own rules are in `notifications`' staff test.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { asRole } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { countNotifications } from '@modules/notifications/tests/factories';
import { notificationsService } from '@modules/notifications';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { callerInScope } from '@kernel/permissions';
import { emitDomainEvent, resetDomainEvents } from '@kernel/events';
import { registerModules } from '@kernel/registry';
import { ORDER_PURCHASE_HOLD_PLACED } from '@modules/orders';
import { RETURN_REQUESTED } from '@modules/returns';
import type { ReturnReason } from '@types';
import { enabledModules } from '../../../../modules';

// The queue, not the copy.
jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

beforeEach(() => {
    mockEnqueueEmail.mockReset();
    mockEnqueueEmail.mockResolvedValue(undefined);
    resetDomainEvents();
    registerModules(enabledModules);
});

afterEach(() => resetDomainEvents());

/** A staff member who can act: the role given, an authenticator app armed. */
const staff = (role: string, email: string, locale = 'en') =>
    createUser(
        {
            email,
            username: email.split('@', 1).join(''),
            locale,
            authenticatorEnabledAt: new Date()
        },
        role
    );

/** `userId` reading the bell as `role`, in the deployment's shop. */
const readerAs = (role: string, userId: string) =>
    callerInScope({ ...asRole(role, userId), tenantId: DEPLOYMENT_TENANT_ID }, 'tenant');

/** The codes in a member's bell, newest first, as they would read it with `role`. */
const bellOf = (role: string, userId: string) =>
    notificationsService.listVisible(readerAs(role, userId)).then(({ items }) => items);

/** A `order.purchase_hold_placed` fact for a buyer. */
const holdPlaced = (userId: string, until = '2026-10-30T09:00:00.000Z') => ({
    tenantId: DEPLOYMENT_TENANT_ID,
    userId,
    until
});

/** The staff-notice mails queued so far. */
const noticeMails = () =>
    mockEnqueueEmail.mock.calls.filter(([, template]) => template === 'notifications.staff-notice');

describe('a purchase hold placed', () => {
    it('tells the moderator and the admin, and nobody whose role does not ban', async () => {
        const moderator = await staff('moderator', 'mod@example.com');
        const admin = await staff('admin', 'admin@example.com');
        const manager = await staff('manager', 'manager@example.com');
        const buyer = await createUser({ email: 'buyer@example.com', username: 'buyer' });

        await emitDomainEvent(ORDER_PURCHASE_HOLD_PLACED, holdPlaced(buyer.id));

        const [notice] = await bellOf('moderator', moderator.id);
        expect(notice).toMatchObject({
            audience: 'staff',
            code: 'shop-tasks.staff.purchase-hold-placed',
            severity: 'warning',
            params: { userId: buyer.id, until: '2026-10-30T09:00:00.000Z' }
        });
        await expect(bellOf('admin', admin.id)).resolves.toHaveLength(1);
        await expect(bellOf('manager', manager.id)).resolves.toEqual([]);
        await expect(bellOf('customer', buyer.id)).resolves.toEqual([]);
    });

    it('skips an account that cannot act: no authenticator app, banned', async () => {
        await createUser({ email: 'unarmed@example.com', username: 'unarmed' }, 'moderator');
        await createUser(
            {
                email: 'banned@example.com',
                username: 'banned',
                active: false,
                authenticatorEnabledAt: new Date()
            },
            'moderator'
        );

        await emitDomainEvent(ORDER_PURCHASE_HOLD_PLACED, holdPlaced('64b7f1a2c3d4e5f607182930'));

        await expect(countNotifications()).resolves.toBe(0);
        await expect(countNotifications()).resolves.toBe(0);
        expect(noticeMails()).toHaveLength(0);
    });

    it('mails each recipient once, in their own language, with a link and no address', async () => {
        await staff('moderator', 'mod@example.com', 'it');
        await staff('admin', 'admin@example.com', 'en');

        await emitDomainEvent(ORDER_PURCHASE_HOLD_PLACED, holdPlaced('64b7f1a2c3d4e5f607182930'));

        const mails = noticeMails();
        expect(mails.map(([envelope]) => envelope.to).toSorted()).toEqual([
            'admin@example.com',
            'mod@example.com'
        ]);
        const italian = mails.find(([envelope]) => envelope.to === 'mod@example.com');
        expect(italian?.[2]).toMatchObject({
            locale: 'it',
            link: expect.stringContaining('/it/users/64b7f1a2c3d4e5f607182930')
        });
        expect(JSON.stringify(mails.map((call) => call[2]))).not.toContain('buyer@');
    });

    it('is told once however often the event is delivered: one row, one mail, per recipient', async () => {
        const moderator = await staff('moderator', 'mod@example.com');
        const fact = holdPlaced('64b7f1a2c3d4e5f607182930');

        await emitDomainEvent(ORDER_PURCHASE_HOLD_PLACED, fact);
        await emitDomainEvent(ORDER_PURCHASE_HOLD_PLACED, fact);

        await expect(bellOf('moderator', moderator.id)).resolves.toHaveLength(1);
        expect(noticeMails()).toHaveLength(1);
    });

    it('treats a second hold on the same buyer, later, as a new situation', async () => {
        const moderator = await staff('moderator', 'mod@example.com');

        await emitDomainEvent(ORDER_PURCHASE_HOLD_PLACED, holdPlaced('64b7f1a2c3d4e5f607182930'));
        await emitDomainEvent(
            ORDER_PURCHASE_HOLD_PLACED,
            holdPlaced('64b7f1a2c3d4e5f607182930', '2026-11-30T09:00:00.000Z')
        );

        await expect(bellOf('moderator', moderator.id)).resolves.toHaveLength(2);
    });
});

/** A `return.requested` fact; a withdrawal is a right, any other reason awaits a decision. */
const returnRequested = (returnId: string, reason: ReturnReason = 'defective') => ({
    returnId,
    orderId: '64b7f1a2c3d4e5f607182940',
    reason,
    requestedAt: '2026-10-26T10:00:00.000Z'
});

describe('a return requested', () => {
    it('tells the people who decide returns, bell only, once per request', async () => {
        const support = await staff('support', 'support@example.com');
        const warehouse = await staff('warehouse', 'warehouse@example.com');
        const fact = returnRequested('64b7f1a2c3d4e5f607182941');

        await emitDomainEvent(RETURN_REQUESTED, fact);
        await emitDomainEvent(RETURN_REQUESTED, fact);

        await expect(bellOf('support', support.id)).resolves.toMatchObject([
            {
                audience: 'staff',
                code: 'shop-tasks.staff.return-requested',
                params: {
                    returnId: '64b7f1a2c3d4e5f607182941',
                    orderId: '64b7f1a2c3d4e5f607182940'
                }
            }
        ]);
        await expect(bellOf('warehouse', warehouse.id)).resolves.toEqual([]);
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('says nothing of a withdrawal, which is a right and awaits no decision', async () => {
        const support = await staff('support', 'support@example.com');

        await emitDomainEvent(
            RETURN_REQUESTED,
            returnRequested('64b7f1a2c3d4e5f607182942', 'withdrawal')
        );

        await expect(bellOf('support', support.id)).resolves.toEqual([]);
    });
});
