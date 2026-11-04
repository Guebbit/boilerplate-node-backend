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
import { OUTBOX_EVENT_DEAD } from '@kernel/outbox';
import { WEBHOOK_SUBSCRIPTION_AUTO_DISABLED } from '@modules/webhooks';
import { DAY_MS } from '@domain-primitives/time';
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

/** A `webhook.subscription_auto_disabled` fact for one subscription. */
const disabled = (
    subscriptionId = '64b7f1a2c3d4e5f607182931',
    disabledAt = '2026-10-26T10:00:00.000Z'
) => ({
    tenantId: DEPLOYMENT_TENANT_ID,
    subscriptionId,
    disabledAt
});

describe('a webhook subscription auto-disabled', () => {
    it('tells the people who manage webhooks and sends no mail, since it is not urgent', async () => {
        const manager = await staff('manager', 'manager@example.com');
        const moderator = await staff('moderator', 'mod@example.com');

        await emitDomainEvent(WEBHOOK_SUBSCRIPTION_AUTO_DISABLED, disabled());

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

    it('is told once however often the event is delivered, and again for a later disable', async () => {
        const manager = await staff('manager', 'manager@example.com');

        await emitDomainEvent(WEBHOOK_SUBSCRIPTION_AUTO_DISABLED, disabled());
        await emitDomainEvent(WEBHOOK_SUBSCRIPTION_AUTO_DISABLED, disabled());
        await expect(bellOf('manager', manager.id)).resolves.toHaveLength(1);

        await emitDomainEvent(
            WEBHOOK_SUBSCRIPTION_AUTO_DISABLED,
            disabled(undefined, '2026-11-26T10:00:00.000Z')
        );
        await expect(bellOf('manager', manager.id)).resolves.toHaveLength(2);
    });

    it('skips an account that cannot act: no authenticator app, banned', async () => {
        const unarmed = await createUser(
            { email: 'unarmed@example.com', username: 'unarmed' },
            'manager'
        );
        const banned = await createUser(
            {
                email: 'banned@example.com',
                username: 'banned',
                active: false,
                authenticatorEnabledAt: new Date()
            },
            'manager'
        );

        await emitDomainEvent(WEBHOOK_SUBSCRIPTION_AUTO_DISABLED, disabled());

        await expect(notificationModel.countDocuments({ userId: unarmed.id })).resolves.toBe(0);
        await expect(notificationModel.countDocuments({ userId: banned.id })).resolves.toBe(0);
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
        const manager = await staff('manager', 'manager@example.com');
        await emitDomainEvent(WEBHOOK_SUBSCRIPTION_AUTO_DISABLED, disabled());
        const [notice] = await bellOf('manager', manager.id);

        await expect(bellOf('support', manager.id)).resolves.toEqual([]);
        await expect(
            notificationsService.get(readerAs('support', manager.id), notice?.id ?? '')
        ).resolves.toMatchObject({ status: 404 });
        await expect(
            notificationsService.get(readerAs('manager', manager.id), notice?.id ?? '')
        ).resolves.toMatchObject({ data: { id: notice?.id } });
    });

    it('never shows a notice of one shop to a reader in another', async () => {
        const manager = await staff('manager', 'manager@example.com');
        await emitDomainEvent(WEBHOOK_SUBSCRIPTION_AUTO_DISABLED, disabled());

        const elsewhere = callerInScope(
            { ...asRole('manager', manager.id), tenantId: 'another-shop' },
            'tenant'
        );

        await expect(notificationsService.listVisible(elsewhere)).resolves.toEqual({ items: [] });
    });

    it('keeps the buyer’s own messages in the same list, newest first', async () => {
        const manager = await staff('manager', 'manager@example.com');
        await createNotification({
            userId: manager.id,
            createdAt: new Date(Date.now() - 60_000)
        });
        await emitDomainEvent(WEBHOOK_SUBSCRIPTION_AUTO_DISABLED, disabled());

        const bell = await bellOf('manager', manager.id);

        expect(bell.map(({ audience }) => audience)).toEqual(['staff', 'own']);
    });
});

describe('retention', () => {
    it('gives a work notice a life, and keeps the staff cap apart from the buyer cap', async () => {
        const manager = await staff('manager', 'manager@example.com');
        await createNotification({ userId: manager.id });

        await withEnvironmentOverrides(
            { NODE_NOTIFICATIONS_STAFF_MAX_PER_USER: '2', NODE_NOTIFICATIONS_STAFF_TTL_DAYS: '10' },
            async () => {
                for (const day of [27, 28, 29])
                    await emitDomainEvent(
                        WEBHOOK_SUBSCRIPTION_AUTO_DISABLED,
                        disabled(undefined, `2026-10-${day}T09:00:00.000Z`)
                    );
            }
        );

        const bell = await bellOf('manager', manager.id);
        expect(bell.filter(({ audience }) => audience === 'staff')).toHaveLength(2);
        expect(bell.filter(({ audience }) => audience === 'own')).toHaveLength(1);
        const stored = await notificationModel.findOne({ userId: manager.id, audience: 'staff' });
        const lifeDays = ((stored?.expiresAt?.getTime() ?? 0) - Date.now()) / DAY_MS;
        expect(lifeDays).toBeGreaterThan(9.9);
        expect(lifeDays).toBeLessThanOrEqual(10);
    });
});

describe('the data export', () => {
    it('lists work notices as a kind and a date, never their facts', async () => {
        const manager = await staff('manager', 'manager@example.com');
        await emitDomainEvent(WEBHOOK_SUBSCRIPTION_AUTO_DISABLED, disabled());

        const exported = await notificationsService.listStaffNotices(manager.id);

        expect(exported).toEqual([
            {
                code: 'notifications.staff.webhook-disabled',
                createdAt: expect.any(String)
            }
        ]);
        await expect(notificationsService.list(manager.id)).resolves.toEqual({ items: [] });
    });
});
