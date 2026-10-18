/**
 * @module
 * `GET /orders/{id}/invoice` and `/credit-notes` over real HTTP: 404 for
 * an order that has not been invoiced yet, 200 once it has, and the same ownership scope every
 * other order read already enforces.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment, withEnvironmentOverrides } from '@tests/environment';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { orderService } from '@modules/orders';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { ServiceBusyError } from '@infrastructure/runtime/busy';
import { renderHtmlToPdf } from '@infrastructure/adapters/pdf';
import { auditLogger } from '@infrastructure/adapters/logger';
import { emptyFileSandbox } from '@tests/file-sandbox';
import { invoicingRepository } from '../../repository';
import { invoicingService } from '../../services';
import { eventually } from '@tests/eventually';

/** A second, distinctly-addressed customer — `authenticateAs('user')` always mints the same
 * default address, which collides the second time one test needs two customers. */
const authenticateAnotherUser = async () => {
    const user = await createUser(
        { email: 'stranger@example.com', verifiedAt: new Date() },
        'customer'
    );
    const response = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD });
    return { user, bearer: `Bearer ${String(response.body.data.token)}` };
};

// No real Chromium in the test environment — same stub `orders`' own contract suite used before
// this route moved here. Captures nothing; this suite only asserts on status and headers.
jest.mock('@infrastructure/adapters/pdf', () => ({
    renderHtmlToPdf: jest.fn().mockResolvedValue(Buffer.from('pdf'))
}));

setupTestDb();

// A downloaded invoice is stored on first render; sweep what the case left in the sandbox.
afterEach(emptyFileSandbox);

/** Waits out the fire-and-forget `ORDER_STATUS_CHANGED` listener that freezes the invoice. */
const waitUntilInvoiced = (orderId: string, bearer: string): Promise<void> =>
    eventually(() =>
        api()
            .get(`/orders/${orderId}/invoice`)
            .set('Authorization', bearer)
            .then((response) => response.status === 200)
    );

describe('GET /orders/{id}/invoice', () => {
    it('refuses a never-paid order with 404 ORDER_INVOICE_NOT_ISSUED', async () => {
        const { bearer, user } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const response = await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(response.body.errors[0].code).toBe('ORDER_INVOICE_NOT_ISSUED');
    });

    it('answers the invoice PDF once the order has been paid', async () => {
        const { bearer, user } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        await orderService.markPaid(String(order._id));
        await waitUntilInvoiced(String(order._id), bearer);

        const response = await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('application/pdf');
        expect(response.headers['cache-control']).toBe('private, no-store');
    });

    it('renders the buyer address in plaintext, though the invoice row stores it encrypted', async () => {
        const { bearer, user } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            billingAddress: {
                fullName: 'Ada Lovelace',
                street: '1 Accounts Office Way',
                city: 'Leeds',
                zip: 'LS1',
                country: 'GB'
            }
        });
        jest.mocked(renderHtmlToPdf).mockClear();

        await orderService.markPaid(String(order._id));
        await waitUntilInvoiced(String(order._id), bearer);

        const html = jest.mocked(renderHtmlToPdf).mock.calls.map(([page]) => page);
        expect(html.some((page) => page.includes('Ada Lovelace'))).toBe(true);
        const row = await invoicingRepository.findInvoiceByOrderId(String(order._id));
        expect(row?.billingAddress?.fullName).not.toBe('Ada Lovelace');
    });

    it('renders the seller the invoice was issued with, after the shop changed its details', async () => {
        // Retention 0 stores no PDF, so every download renders afresh and a cache cannot hide a live read.
        setEnvironment({ NODE_INVOICE_PDF_RETENTION_DAYS: '0' });
        const { bearer, user } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        await orderService.markPaid(String(order._id));
        await waitUntilInvoiced(String(order._id), bearer);

        setEnvironment({ NODE_SHOP_LEGAL_NAME: 'Renamed Holding Srl' });
        jest.mocked(renderHtmlToPdf).mockClear();
        const response = await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        const html = jest.mocked(renderHtmlToPdf).mock.calls.map(([page]) => page);
        expect(html.some((page) => page.includes('Guebbit Demo Shop Srl'))).toBe(true);
        expect(html.some((page) => page.includes('Renamed Holding Srl'))).toBe(false);
    });

    it("a scoped caller cannot download another customer's invoice — absence, not refusal", async () => {
        const owner = await authenticateAs('user');
        const stranger = await authenticateAnotherUser();
        const product = await createProduct();
        const order = await createOrder(owner.user, [toOrderItem(product, 1)]);
        await orderService.markPaid(String(order._id));
        await waitUntilInvoiced(String(order._id), owner.bearer);

        const response = await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', stranger.bearer);

        expect(response.status).toBe(404);
    });

    it("an admin CAN download another customer's invoice", async () => {
        const owner = await authenticateAs('user');
        const admin = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(owner.user, [toOrderItem(product, 1)]);
        await orderService.markPaid(String(order._id));
        await waitUntilInvoiced(String(order._id), owner.bearer);

        const response = await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', admin.bearer);

        expect(response.status).toBe(200);
    });

    it("records an admin's download, and not the owner's own", async () => {
        const owner = await authenticateAs('user');
        const admin = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(owner.user, [toOrderItem(product, 1)]);
        await orderService.markPaid(String(order._id));
        await waitUntilInvoiced(String(order._id), owner.bearer);
        const auditSpy = jest.spyOn(auditLogger, 'log').mockImplementation(() => auditLogger);
        const viewedActions = () =>
            auditSpy.mock.calls
                .map((call) => (call[2] as { action?: string }).action)
                .filter((action) => action === 'admin.invoice.viewed');

        await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', owner.bearer);
        expect(viewedActions()).toEqual([]);

        await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', admin.bearer);
        expect(viewedActions()).toEqual(['admin.invoice.viewed']);
        auditSpy.mockRestore();
    });

    it('answers 404 for an unusable id, not a 422', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().get('/orders/not-an-id/invoice').set('Authorization', bearer);

        expect(response.status).toBe(404);
    });
});

describe('GET /orders/{id}/invoice — when the render queue is full', () => {
    // Retention 0 so the invoice is rendered on every download (the polling helper below included):
    // a stored copy would answer without ever reaching the renderer this case makes refuse.
    it('answers 503 SERVICE_UNAVAILABLE with Retry-After', () =>
        withEnvironmentOverrides({ NODE_INVOICE_PDF_RETENTION_DAYS: '0' }, async () => {
            const { bearer, user } = await authenticateAs('user');
            const product = await createProduct();
            const order = await createOrder(user, [toOrderItem(product, 1)]);
            await orderService.markPaid(String(order._id));
            await waitUntilInvoiced(String(order._id), bearer);
            jest.mocked(renderHtmlToPdf).mockRejectedValueOnce(new ServiceBusyError('queue full'));

            const response = await api()
                .get(`/orders/${String(order._id)}/invoice`)
                .set('Authorization', bearer);

            expect(response.status).toBe(503);
            expect(response.body.errors[0].code).toBe('SERVICE_UNAVAILABLE');
            expect(Number(response.headers['retry-after'])).toBeGreaterThanOrEqual(1);
        }));
});

describe('GET /orders/{id}/invoice — the stored copy', () => {
    it('renders once, then answers the second download from the stored file', async () => {
        const { bearer, user } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        await orderService.markPaid(String(order._id));
        // The polling helper downloads (and so renders and stores) until the invoice exists.
        await waitUntilInvoiced(String(order._id), bearer);
        jest.mocked(renderHtmlToPdf).mockClear();

        const first = await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', bearer);
        const second = await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', bearer);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(second.body).toEqual(first.body);
        expect(renderHtmlToPdf).not.toHaveBeenCalled();
    });
});

describe('GET /orders/{id} — the actions.invoice flag', () => {
    it('is false before payment and true once the order is paid', async () => {
        const { bearer, user } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const before = await api()
            .get(`/orders/${String(order._id)}`)
            .set('Authorization', bearer);
        expect(before.body.data.actions.invoice).toBe(false);

        await orderService.markPaid(String(order._id));

        const after = await api()
            .get(`/orders/${String(order._id)}`)
            .set('Authorization', bearer);
        expect(after.body.data.actions.invoice).toBe(true);
    });
});

describe('GET /orders/{id}/credit-notes', () => {
    it('lists nothing for an order never refunded', async () => {
        const { bearer, user } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const response = await api()
            .get(`/orders/${String(order._id)}/credit-notes`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual([]);
    });

    it("refuses someone else's order with 404", async () => {
        const { user } = await authenticateAs('user');
        const { bearer: strangerBearer } = await authenticateAnotherUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const response = await api()
            .get(`/orders/${String(order._id)}/credit-notes`)
            .set('Authorization', strangerBearer);

        expect(response.status).toBe(404);
    });
});

/** An order refunded in full, with the credit note issued, and the buyer's bearer. */
const refundedOrder = async () => {
    const owner = await authenticateAs('user');
    const product = await createProduct();
    const order = await createOrder(owner.user, [toOrderItem(product, 1)]);
    const orderId = String(order._id);
    await orderService.markPaid(orderId);
    await waitUntilInvoiced(orderId, owner.bearer);
    const creditNote = await invoicingService.issueCreditNote({
        orderId,
        refundId: 'refund-2',
        amount: 1,
        full: true
    });
    return { orderId, creditNoteId: String(creditNote?._id), owner };
};

describe('the credit notes of an order the caller may read but not its money', () => {
    it('lists none to the warehouse, which packs the order but may not read refunds', async () => {
        const { orderId } = await refundedOrder();
        const warehouse = await authenticateAsRole('warehouse');

        const response = await api()
            .get(`/orders/${orderId}/credit-notes`)
            .set('Authorization', warehouse.bearer);

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual([]);
    });

    it('answers the warehouse a download with the same 404 a stranger gets', async () => {
        const { orderId, creditNoteId } = await refundedOrder();
        const warehouse = await authenticateAsRole('warehouse');

        const response = await api()
            .get(`/orders/${orderId}/credit-notes/${creditNoteId}`)
            .set('Authorization', warehouse.bearer);

        expect(response.status).toBe(404);
        expect(response.body.errors[0].code).toBe('ORDER_CREDIT_NOTE_NOT_ISSUED');
    });

    it('lists them to the support desk, which reads payments', async () => {
        const { orderId } = await refundedOrder();
        const support = await authenticateAsRole('support');

        const response = await api()
            .get(`/orders/${orderId}/credit-notes`)
            .set('Authorization', support.bearer);

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(1);
    });
});

describe('GET /orders/{id}/credit-notes/{creditNoteId} — who may download', () => {
    it('serves the owner a private, uncached PDF', async () => {
        const { orderId, creditNoteId, owner } = await refundedOrder();

        const response = await api()
            .get(`/orders/${orderId}/credit-notes/${creditNoteId}`)
            .set('Authorization', owner.bearer);

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/application\/pdf/);
        expect(response.headers['cache-control']).toMatch(/private/);
        expect(response.headers['cache-control']).toMatch(/no-store/);
    });

    it('answers a stranger 404 ORDER_NOT_FOUND, and sends no document', async () => {
        const { orderId, creditNoteId } = await refundedOrder();
        const { bearer: strangerBearer } = await authenticateAnotherUser();

        const response = await api()
            .get(`/orders/${orderId}/credit-notes/${creditNoteId}`)
            .set('Authorization', strangerBearer);

        expect(response.status).toBe(404);
        expect(response.headers['content-type']).not.toMatch(/pdf/);
    });

    // The note belongs to order A; the owner names it under their own order B. Dropping the order
    // match from the lookup would hand over a document of another order.
    it('answers the owner 404 ORDER_CREDIT_NOTE_NOT_ISSUED for a note that is on another of their orders', async () => {
        const { creditNoteId, owner } = await refundedOrder();
        const other = await createOrder(owner.user, [toOrderItem(await createProduct(), 1)]);

        const response = await api()
            .get(`/orders/${String(other._id)}/credit-notes/${creditNoteId}`)
            .set('Authorization', owner.bearer);

        expect(response.status).toBe(404);
        expect(response.body.errors[0].code).toBe('ORDER_CREDIT_NOTE_NOT_ISSUED');
    });
});

describe('GET /orders/{id}/credit-notes/{creditNoteId}', () => {
    it('refuses a credit note the order does not have with 404 ORDER_CREDIT_NOTE_NOT_ISSUED', async () => {
        const { bearer, user } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const response = await api()
            .get(`/orders/${String(order._id)}/credit-notes/${'a'.repeat(24)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(response.body.errors[0].code).toBe('ORDER_CREDIT_NOTE_NOT_ISSUED');
    });

    it("records an admin's download, and not the owner's own", async () => {
        const owner = await authenticateAs('user');
        const admin = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(owner.user, [toOrderItem(product, 1)]);
        const orderId = String(order._id);
        await orderService.markPaid(orderId);
        await waitUntilInvoiced(orderId, owner.bearer);
        const creditNote = await invoicingService.issueCreditNote({
            orderId,
            refundId: 'refund-1',
            amount: 1,
            full: true
        });
        const url = `/orders/${orderId}/credit-notes/${String(creditNote?._id)}`;
        const auditSpy = jest.spyOn(auditLogger, 'log').mockImplementation(() => auditLogger);
        const viewed = () =>
            auditSpy.mock.calls
                .map((call) => call[2] as { action?: string; targetId?: string })
                .filter((entry) => entry.action === 'admin.credit_note.viewed')
                .map((entry) => entry.targetId);

        const own = await api().get(url).set('Authorization', owner.bearer);
        expect(own.status).toBe(200);
        expect(viewed()).toEqual([]);

        await api().get(url).set('Authorization', admin.bearer);
        expect(viewed()).toEqual([String(creditNote?._id)]);
        auditSpy.mockRestore();
    });
});
