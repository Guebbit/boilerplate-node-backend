/**
 * @module
 * Work notices, driven the way production drives them: the real modules registered, a domain event
 * at one end, the bell of each member at the other. Proves who is told (the sets, the unrestricted
 * roles, only accounts that can act), that a redelivery tells nobody twice, that mail follows the
 * route's class, and that the reader's CURRENT role decides what the bell shows.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { asRole } from '@tests/callers';
import { withEnvironmentOverrides } from '@tests/environment';
import { createUser } from '@modules/users/tests/factories';
import { createNotification } from '@modules/notifications/tests/factories';
import { notificationsService } from '@modules/notifications/services';
import { notificationModel } from '@modules/notifications/model';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { callerInScope } from '@kernel/permissions';
import { emitDomainEvent, resetDomainEvents } from '@kernel/events';
import { registerModules } from '@kernel/registry';
import { ORDER_PURCHASE_HOLD_PLACED } from '@modules/orders';
import { OUTBOX_EVENT_DEAD } from '@kernel/outbox';
import { RETURN_REQUESTED } from '@modules/returns';
import { WEBHOOK_SUBSCRIPTION_AUTO_DISABLED } from '@modules/webhooks';
import { DAY_MS } from '@domain-primitives/time';
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
            code: 'notifications.staff.purchase-hold-placed',
            severity: 'warning',
            params: { userId: buyer.id, until: '2026-10-30T09:00:00.000Z' }
        });
        await expect(bellOf('admin', admin.id)).resolves.toHaveLength(1);
        await expect(bellOf('manager', manager.id)).resolves.toEqual([]);
        await expect(bellOf('customer', buyer.id)).resolves.toEqual([]);
    });

    it('skips an account that cannot act: no authenticator app, banned', async () => {
        const unarmed = await createUser(
            { email: 'unarmed@example.com', username: 'unarmed' },
            'moderator'
        );
        const banned = await createUser(
            {
                email: 'banned@example.com',
                username: 'banned',
                active: false,
                authenticatorEnabledAt: new Date()
            },
            'moderator'
        );

        await emitDomainEvent(ORDER_PURCHASE_HOLD_PLACED, holdPlaced('64b7f1a2c3d4e5f607182930'));

        await expect(notificationModel.countDocuments({ userId: unarmed.id })).resolves.toBe(0);
        await expect(notificationModel.countDocuments({ userId: banned.id })).resolves.toBe(0);
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

describe('a webhook subscription auto-disabled', () => {
    it('tells the people who manage webhooks and sends no mail, since it is not urgent', async () => {
        const manager = await staff('manager', 'manager@example.com');
        const moderator = await staff('moderator', 'mod@example.com');

        await emitDomainEvent(WEBHOOK_SUBSCRIPTION_AUTO_DISABLED, {
            tenantId: DEPLOYMENT_TENANT_ID,
            subscriptionId: '64b7f1a2c3d4e5f607182931',
            disabledAt: '2026-10-26T10:00:00.000Z'
        });

        await expect(bellOf('manager', manager.id)).resolves.toMatchObject([
            {
                audience: 'staff',
                code: 'notifications.staff.webhook-disabled',
                params: { subscriptionId: '64b7f1a2c3d4e5f607182931' }
            }
        ]);
        await expect(bellOf('moderator', moderator.id)).resolves.toEqual([]);
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
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
                code: 'notifications.staff.return-requested',
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

describe('an outbox event parked as dead', () => {
    it('tells the administrators alone, once per event, and names the record, not its payload', async () => {
        const admin = await staff('admin', 'admin@example.com');
        const manager = await staff('manager', 'manager@example.com');
        const fact = {
            eventId: 'e1',
            eventName: 'order.paid',
            aggregateId: '64b7f1a2c3d4e5f607182943'
        };

        await emitDomainEvent(OUTBOX_EVENT_DEAD, fact);
        await emitDomainEvent(OUTBOX_EVENT_DEAD, fact);
        await emitDomainEvent(OUTBOX_EVENT_DEAD, { ...fact, eventId: 'e2' });

        await expect(bellOf('admin', admin.id)).resolves.toMatchObject([
            { code: 'notifications.staff.outbox-dead', severity: 'error' },
            { code: 'notifications.staff.outbox-dead', severity: 'error' }
        ]);
        await expect(bellOf('manager', manager.id)).resolves.toEqual([]);
    });
});

describe('what the bell shows follows the reader’s role now', () => {
    it('hides a notice from a member who no longer holds its sets, and from a lookup by id', async () => {
        const moderator = await staff('moderator', 'mod@example.com');
        await emitDomainEvent(ORDER_PURCHASE_HOLD_PLACED, holdPlaced('64b7f1a2c3d4e5f607182930'));
        const [notice] = await bellOf('moderator', moderator.id);

        await expect(bellOf('support', moderator.id)).resolves.toEqual([]);
        await expect(
            notificationsService.get(readerAs('support', moderator.id), notice?.id ?? '')
        ).resolves.toMatchObject({ status: 404 });
        await expect(
            notificationsService.get(readerAs('moderator', moderator.id), notice?.id ?? '')
        ).resolves.toMatchObject({ data: { id: notice?.id } });
    });

    it('never shows a notice of one shop to a reader in another', async () => {
        const moderator = await staff('moderator', 'mod@example.com');
        await emitDomainEvent(ORDER_PURCHASE_HOLD_PLACED, holdPlaced('64b7f1a2c3d4e5f607182930'));

        const elsewhere = callerInScope(
            { ...asRole('moderator', moderator.id), tenantId: 'another-shop' },
            'tenant'
        );

        await expect(notificationsService.listVisible(elsewhere)).resolves.toEqual({ items: [] });
    });

    it('keeps the buyer’s own messages in the same list, newest first', async () => {
        const moderator = await staff('moderator', 'mod@example.com');
        await createNotification({
            userId: moderator.id,
            createdAt: new Date(Date.now() - 60_000)
        });
        await emitDomainEvent(ORDER_PURCHASE_HOLD_PLACED, holdPlaced('64b7f1a2c3d4e5f607182930'));

        const bell = await bellOf('moderator', moderator.id);

        expect(bell.map(({ audience }) => audience)).toEqual(['staff', 'own']);
    });
});

describe('retention', () => {
    it('gives a work notice a life, and keeps the staff cap apart from the buyer cap', async () => {
        const moderator = await staff('moderator', 'mod@example.com');
        await createNotification({ userId: moderator.id });

        await withEnvironmentOverrides(
            { NODE_NOTIFICATIONS_STAFF_MAX_PER_USER: '2', NODE_NOTIFICATIONS_STAFF_TTL_DAYS: '10' },
            async () => {
                for (const day of [27, 28, 29])
                    await emitDomainEvent(
                        ORDER_PURCHASE_HOLD_PLACED,
                        holdPlaced('64b7f1a2c3d4e5f607182930', `2026-10-${day}T09:00:00.000Z`)
                    );
            }
        );

        const bell = await bellOf('moderator', moderator.id);
        expect(bell.filter(({ audience }) => audience === 'staff')).toHaveLength(2);
        expect(bell.filter(({ audience }) => audience === 'own')).toHaveLength(1);
        const stored = await notificationModel.findOne({ userId: moderator.id, audience: 'staff' });
        const lifeDays = ((stored?.expiresAt?.getTime() ?? 0) - Date.now()) / DAY_MS;
        expect(lifeDays).toBeGreaterThan(9.9);
        expect(lifeDays).toBeLessThanOrEqual(10);
    });
});

describe('the data export', () => {
    it('lists work notices as a kind and a date, never their facts', async () => {
        const moderator = await staff('moderator', 'mod@example.com');
        await emitDomainEvent(ORDER_PURCHASE_HOLD_PLACED, holdPlaced('64b7f1a2c3d4e5f607182930'));

        const exported = await notificationsService.listStaffNotices(moderator.id);

        expect(exported).toEqual([
            {
                code: 'notifications.staff.purchase-hold-placed',
                createdAt: expect.any(String)
            }
        ]);
        await expect(notificationsService.list(moderator.id)).resolves.toEqual({ items: [] });
    });
});
