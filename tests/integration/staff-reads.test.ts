/**
 * @module
 * Staff opening someone else's record leaves `admin.<resource>.viewed`; a customer reading their
 * own, a staff member reading their own, and a list do not. Detail routes only, over real HTTP.
 */

import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { auditLogger } from '@infrastructure/adapters/logger';
import { auditLogRepository, AUDIT_SORT } from '@modules/audit-logs/repository';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { OrderStatus } from '@types';
import { carryOrderTo } from '@modules/delivery/tests/factories';
import { credentialHolding, credentialOf } from '@tests/credentials';
import { createSystemTask, findAllTasks } from '@modules/tasks/tests/factories';
import { settleInlineExports } from '@modules/account/services/export';
import { requestAndDownloadExport } from '@tests/account-export';
import { emptyFileSandbox } from '@tests/file-sandbox';

setupTestDb();

/** One audit entry as the logger receives it. */
interface Entry {
    action: string;
    actorUserId?: string;
    targetType?: string;
    targetId?: string;
    subjectId?: string;
}

/** Spy on the audit emitter; each case reads what the flow recorded. */
let auditSpy: jest.SpyInstance;

beforeEach(() => {
    auditSpy = jest.spyOn(auditLogger, 'log').mockImplementation(() => auditLogger);
});

afterEach(() => {
    auditSpy.mockRestore();
    // The export test writes a file into the private store; a test removes every file it causes.
    return settleInlineExports().then(emptyFileSandbox);
});

/** The `*.viewed` entries recorded so far. */
const viewed = (): Entry[] =>
    auditSpy.mock.calls
        .map((call: unknown[]) => call[2] as Entry)
        .filter((entry) => /^admin\.\w+\.viewed$/.test(entry.action));

/** Polls until the sink has stored a staff read about `subjectId`: the write is not awaited by the request. */
const waitForStoredRead = async (subjectId: string): Promise<void> => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        const stored = await auditLogRepository.search({ subject: subjectId }, {}, AUDIT_SORT);
        if (stored.items.length > 0) return;
        await new Promise((resolve) => {
            setTimeout(resolve, 20);
        });
    }
    throw new Error('the staff read was never stored');
};

/** A customer with one shipped order, and an admin to read it with. */
const shopWithOrder = async () => {
    const customer = await authenticateAs('user');
    const admin = await authenticateAs('admin');
    const product = await createProduct({ price: '20.00' });
    const order = await createOrder(customer.user, [toOrderItem(product, 1)], {
        status: OrderStatus.processing
    });
    // Shipped through the real doors, so there is a shipment for a return to name.
    await carryOrderTo(String(order._id), 'shipped');
    return { customer, admin, orderId: String(order._id) };
};

describe('GET /users/{id}', () => {
    it("records an admin opening another account's detail", async () => {
        const customer = await authenticateAs('user');
        const admin = await authenticateAs('admin');
        auditSpy.mockClear();

        const response = await api()
            .get(`/users/${String(customer.user._id)}`)
            .set('Authorization', admin.bearer);

        expect(response.status).toBe(200);
        expect(viewed()).toEqual([
            expect.objectContaining({
                action: 'admin.user.viewed',
                actorUserId: String(admin.user._id),
                targetType: 'user',
                targetId: String(customer.user._id),
                subjectId: String(customer.user._id)
            })
        ]);
    });

    it('does not record an admin opening their own account', async () => {
        const admin = await authenticateAs('admin');
        auditSpy.mockClear();

        await api()
            .get(`/users/${String(admin.user._id)}`)
            .set('Authorization', admin.bearer);

        expect(viewed()).toEqual([]);
    });

    it('records a key opening the account of the person who minted it', async () => {
        const secret = await credentialHolding(['read:User']);
        const resolved = await credentialOf(secret);
        const minterId = resolved?.caller.id;
        auditSpy.mockClear();

        const response = await api()
            .get(`/users/${minterId}`)
            .set('Authorization', `Bearer ${secret}`);

        expect(response.status).toBe(200);
        expect(viewed()).toEqual([
            expect.objectContaining({ action: 'admin.user.viewed', targetId: minterId })
        ]);
    });

    it('does not record the list', async () => {
        const admin = await authenticateAs('admin');
        auditSpy.mockClear();

        await api().get('/users').set('Authorization', admin.bearer);

        expect(viewed()).toEqual([]);
    });
});

describe('GET /orders/{id}', () => {
    it("records staff opening a customer's order", async () => {
        const { customer, admin, orderId } = await shopWithOrder();
        auditSpy.mockClear();

        const response = await api().get(`/orders/${orderId}`).set('Authorization', admin.bearer);

        expect(response.status).toBe(200);
        expect(viewed()).toEqual([
            expect.objectContaining({
                action: 'admin.order.viewed',
                targetType: 'order',
                targetId: orderId,
                subjectId: String(customer.user._id)
            })
        ]);
    });

    it('does not record the customer reading their own order', async () => {
        const { customer, orderId } = await shopWithOrder();
        auditSpy.mockClear();

        const response = await api()
            .get(`/orders/${orderId}`)
            .set('Authorization', customer.bearer);

        expect(response.status).toBe(200);
        expect(viewed()).toEqual([]);
    });

    it('does not record the orders list', async () => {
        const { admin } = await shopWithOrder();
        auditSpy.mockClear();

        await api().get('/orders').set('Authorization', admin.bearer);

        expect(viewed()).toEqual([]);
    });
});

describe('GET /returns/{id}', () => {
    it('records staff opening a return, and not the customer who opened it', async () => {
        const { customer, admin, orderId } = await shopWithOrder();
        const opened = await api()
            .post('/returns')
            .set('Authorization', customer.bearer)
            .send({ orderId, reason: 'withdrawal' });
        const returnId = String(opened.body.id);
        auditSpy.mockClear();

        await api().get(`/returns/${returnId}`).set('Authorization', customer.bearer);
        expect(viewed()).toEqual([]);

        await api().get(`/returns/${returnId}`).set('Authorization', admin.bearer);
        expect(viewed()).toEqual([
            // The return holds no buyer; the row names the order's buyer as the person.
            expect.objectContaining({
                action: 'admin.return.viewed',
                targetId: returnId,
                subjectId: String(customer.user._id)
            })
        ]);
    });
});

describe('GET /tasks/{id}', () => {
    it('records staff opening a visitor message, naming the task', async () => {
        const admin = await authenticateAs('admin');
        await api().post('/tasks').send({
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            subject: 'Broken checkout',
            message: 'The checkout button does nothing on mobile.'
        });
        const [task] = await findAllTasks();
        auditSpy.mockClear();

        const response = await api()
            .get(`/tasks/${String(task._id)}`)
            .set('Authorization', admin.bearer);

        expect(response.status).toBe(200);
        // Filtered on the target: other staff reads of the same action may be target-less.
        expect(viewed().filter((entry) => entry.targetId === String(task._id))).toEqual([
            expect.objectContaining({
                action: 'admin.task.viewed',
                actorUserId: String(admin.user._id),
                targetType: 'task'
            })
        ]);
    });

    it('records nothing for a system task, which holds no visitor data', async () => {
        const admin = await authenticateAs('admin');
        const task = await createSystemTask();
        auditSpy.mockClear();

        const response = await api()
            .get(`/tasks/${String(task._id)}`)
            .set('Authorization', admin.bearer);

        expect(response.status).toBe(200);
        expect(viewed()).toEqual([]);
    });
});

describe('the person whose record staff opened', () => {
    it('finds the consultation in their own data export, with a purpose and no staff member', async () => {
        const { customer, admin, orderId } = await shopWithOrder();
        await api().get(`/orders/${orderId}`).set('Authorization', admin.bearer);
        // The audit write is fire-and-forget: wait until the row is stored before exporting.
        await waitForStoredRead(String(customer.user._id));

        const { data } = await requestAndDownloadExport(customer.bearer);

        const { consultations } = data as {
            consultations: { windowDays: number; entries: Record<string, string>[] };
        };
        expect(consultations.entries).toEqual([
            {
                timestamp: expect.any(String) as string,
                targetType: 'order',
                targetId: orderId,
                purpose: 'handling your order'
            }
        ]);
        expect(JSON.stringify(consultations)).not.toContain(String(admin.user._id));
    });
});
