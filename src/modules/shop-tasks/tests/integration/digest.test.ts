/**
 * @module
 * The staff digest, driven the way the job drives it: real modules registered, real orders,
 * returns and shipments in the database, and the bell and the mail queue at the other end. Proves
 * who gets which summary, that a re-run writes and mails nothing twice, that a count of zero clears
 * the row, and that only the overdue summaries are mailed.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { asRole } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import {
    createOrder,
    markOrderPaidAt,
    toOrderItem,
    forceOrderStatus
} from '@modules/orders/tests/factories';
import { backdateShipments, carryOrderTo, shipEverything } from '@modules/delivery/tests/factories';
import { insertBareReturns } from '@modules/returns/tests/factories';
import { notificationsService } from '@modules/notifications';
import { runStaffDigest } from '../../services/digest';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { callerInScope } from '@kernel/permissions';
import { resetDomainEvents } from '@kernel/events';
import { registerModules } from '@kernel/registry';
import { DAY_MS } from '@domain-primitives/time';
import { OrderStatus } from '@types';
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

/** The summary rows in a member's bell, as `[code, count]`, sorted. */
const summariesOf = (role: string, userId: string) =>
    notificationsService
        .listVisible(
            callerInScope({ ...asRole(role, userId), tenantId: DEPLOYMENT_TENANT_ID }, 'tenant')
        )
        .then(({ items }) =>
            items
                .map((item) => [item.code, 'count' in item.params ? item.params.count : 0] as const)
                .toSorted()
        );

/** The `work` path the member's bell row carries for the unshipped summary. */
const unshippedWorkOf = (role: string, userId: string) =>
    notificationsService
        .listVisible(
            callerInScope({ ...asRole(role, userId), tenantId: DEPLOYMENT_TENANT_ID }, 'tenant')
        )
        .then(
            ({ items }) =>
                items.find((item) => item.code === 'shop-tasks.staff.unshipped')?.params.work
        );

/** The digest mails queued so far. */
const digestMails = () =>
    mockEnqueueEmail.mock.calls.filter(([, template]) => template === 'shop-tasks.staff-digest');

/** A paid order the warehouse has not shipped for `days` days. */
let buyers = 0;
const paidAndWaiting = async (days: number) => {
    buyers += 1;
    const user = await createUser({
        email: `buyer${String(buyers)}@example.com`,
        username: `buyer${String(buyers)}`
    });
    const product = await createProduct();
    const order = await createOrder(user, [toOrderItem(product, 1)], { status: OrderStatus.paid });
    await markOrderPaidAt(String(order._id), new Date(Date.now() - days * DAY_MS));
    return order;
};

describe('the daily digest', () => {
    it('tells the desk that ships about a paid order that waited, bell only, to no one else', async () => {
        const warehouse = await staff('warehouse', 'warehouse@example.com');
        const support = await staff('support', 'support@example.com');
        await paidAndWaiting(5);
        await paidAndWaiting(0);

        await runStaffDigest('daily');

        await expect(summariesOf('warehouse', warehouse.id)).resolves.toEqual([
            ['shop-tasks.staff.unshipped', 1]
        ]);
        await expect(summariesOf('support', support.id)).resolves.toEqual([]);
    });

    it('mails the overdue summary once, in the reader’s language, and not a second run', async () => {
        const warehouse = await staff('warehouse', 'warehouse@example.com', 'it');
        await paidAndWaiting(5);

        await runStaffDigest('daily');
        await runStaffDigest('daily');

        // The bell carries the filtered list path, and the mail links the very same one.
        const work = await unshippedWorkOf('warehouse', warehouse.id);
        expect(work).toEqual(expect.stringContaining('sales/orders?'));

        const mails = digestMails();
        expect(mails).toHaveLength(1);
        expect(mails[0][0]).toMatchObject({ to: 'warehouse@example.com' });
        expect(mails[0][2]).toMatchObject({
            locale: 'it',
            lines: [{ link: expect.stringContaining(`/it/${String(work)}`) }]
        });
    });

    it('mails a count that grew, and rewrites one row rather than piling copies', async () => {
        const warehouse = await staff('warehouse', 'warehouse@example.com');
        await paidAndWaiting(5);
        await runStaffDigest('daily');
        await paidAndWaiting(6);

        await runStaffDigest('daily');

        await expect(summariesOf('warehouse', warehouse.id)).resolves.toEqual([
            ['shop-tasks.staff.unshipped', 2]
        ]);
        expect(digestMails()).toHaveLength(2);
    });

    it('removes the row when the count falls to zero', async () => {
        const warehouse = await staff('warehouse', 'warehouse@example.com');
        const order = await paidAndWaiting(5);
        await runStaffDigest('daily');

        await forceOrderStatus(String(order._id), OrderStatus.canceled);
        await runStaffDigest('daily');

        await expect(summariesOf('warehouse', warehouse.id)).resolves.toEqual([]);
    });

    it('sends no mail for a summary that is the bell’s alone', async () => {
        const moderator = await staff('moderator', 'mod@example.com');
        const [user, product] = await Promise.all([createUser(), createProduct()]);
        await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.pending,
            paymentMethod: 'bank_transfer',
            payBy: new Date(Date.now() + 3_600_000).toISOString()
        });

        await runStaffDigest('daily');

        expect(digestMails()).toHaveLength(0);
        await expect(summariesOf('moderator', moderator.id)).resolves.toContainEqual([
            'shop-tasks.staff.transfers-due',
            1
        ]);
    });

    it('counts a parcel shipped and never marked arrived, once the allowance has passed', async () => {
        const warehouse = await staff('warehouse', 'warehouse@example.com');
        const order = await paidAndWaiting(0);
        await carryOrderTo(String(order._id), 'shipped');
        await backdateShipments(20);

        await runStaffDigest('daily');

        await expect(summariesOf('warehouse', warehouse.id)).resolves.toContainEqual([
            'shop-tasks.staff.undelivered',
            1
        ]);
    });

    it('counts a tracked parcel still without its code, and not one that has it', async () => {
        const warehouse = await staff('warehouse', 'warehouse@example.com');
        const [user, product] = await Promise.all([createUser(), createProduct()]);
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.paid,
            shippingMethod: 'express',
            shippingCost: '0.00'
        });
        await forceOrderStatus(String(order._id), OrderStatus.processing);
        await shipEverything(String(order._id));
        await backdateShipments(3);

        await runStaffDigest('daily');

        await expect(summariesOf('warehouse', warehouse.id)).resolves.toContainEqual([
            'shop-tasks.staff.awaiting-tracking',
            1
        ]);
    });

    it('counts a return request nobody decided, and an approved withdrawal overdue for its goods', async () => {
        const support = await staff('support', 'support@example.com');
        const warehouse = await staff('warehouse', 'warehouse@example.com');
        await insertBareReturns([
            { status: 'requested', reason: 'defective', daysAgo: 10 },
            { status: 'approved', reason: 'withdrawal', daysAgo: 22 }
        ]);

        await runStaffDigest('daily');

        await expect(summariesOf('support', support.id)).resolves.toEqual([
            ['shop-tasks.staff.returns-undecided', 1]
        ]);
        await expect(summariesOf('warehouse', warehouse.id)).resolves.toContainEqual([
            'shop-tasks.staff.returns-awaiting-goods',
            1
        ]);
    });
});

/** The counts the warehouse sees for the overdue-returns row. */
const awaiting = (id: string) =>
    summariesOf('warehouse', id).then((rows) =>
        rows.filter(([code]) => code === 'shop-tasks.staff.returns-awaiting-goods')
    );

describe('returns overdue for their goods', () => {
    it('counts nothing before 14 days plus the transit allowance have passed', async () => {
        const warehouse = await staff('warehouse', 'warehouse@example.com');
        await insertBareReturns([
            { status: 'approved', reason: 'withdrawal', daysAgo: 20 },
            { status: 'approved', reason: 'defective', daysAgo: 20 }
        ]);

        await runStaffDigest('daily');

        await expect(awaiting(warehouse.id)).resolves.toEqual([]);
    });

    it('counts a withdrawal and a faulty item alike once overdue, and skips one with a proof', async () => {
        const warehouse = await staff('warehouse', 'warehouse@example.com');
        await insertBareReturns([
            { status: 'approved', reason: 'withdrawal', daysAgo: 22 },
            { status: 'approved', reason: 'wrong_item', daysAgo: 22 },
            { status: 'approved', reason: 'withdrawal', daysAgo: 22, proof: true }
        ]);

        await runStaffDigest('daily');

        await expect(awaiting(warehouse.id)).resolves.toEqual([
            ['shop-tasks.staff.returns-awaiting-goods', 2]
        ]);
    });

    it('mails the warehouse the overdue row once, as a digest line', async () => {
        await staff('warehouse', 'warehouse@example.com');
        await insertBareReturns([{ status: 'approved', reason: 'withdrawal', daysAgo: 22 }]);

        const result = await runStaffDigest('daily');

        expect(result.mailed).toBe(1);
    });
});

describe('the weekly digest', () => {
    it('writes the late-preorder row only, and leaves the daily rows alone', async () => {
        const warehouse = await staff('warehouse', 'warehouse@example.com');
        await paidAndWaiting(5);

        const result = await runStaffDigest('weekly');

        expect(result).toEqual({ written: 0, cleared: 1, mailed: 0 });
        await expect(summariesOf('warehouse', warehouse.id)).resolves.toEqual([]);
    });
});
