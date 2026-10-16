/**
 * @module
 * The orders CSV, through the service's public door: the list's filters and order, a formula
 * escaped in a customer's email, a refusal before any byte when the result is over the cap, an
 * audit row that carries the filter and the count but never a row or an email, and a read scope
 * that bounds the file. Real Mongo.
 */
import { text } from 'node:stream/consumers';
import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment } from '@tests/environment';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { asAdmin, asCustomer, callerContextAs } from '@tests/callers';
import { observePort } from '@tests/ports';
import * as auditPort from '@infrastructure/observability/audit';
import { OrderStatus } from '@types';
import { ordersAuditActions } from '../../audit';
import { ORDER_CSV_COLUMNS } from '../../domain';
import { orderService } from '../../services';

/*
 * The audit port is REPLACED, not spied on — see `cancel.test.ts` for the full reasoning
 * (`jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes).
 */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

setupTestDb();

afterEach(() => jest.restoreAllMocks());

/** The staff member behind every export below. */
const staff = callerContextAs('admin', 'admin-1');

/** The CSV a successful export would write, or a loud failure. */
const csvOf = (
    opened: Awaited<ReturnType<typeof orderService.openOrderExport>>
): Promise<string> => {
    if ('success' in opened) throw new Error(`export refused: ${JSON.stringify(opened.errors)}`);
    return text(opened.source.pipe(opened.csv));
};

/** One order of one buyer, at a time of the test's choosing. */
const orderOf = async (email: string, status: OrderStatus = OrderStatus.paid, createdAt?: Date) => {
    const user = await createUser({ email, username: email.replaceAll(/\W/g, '') });
    const product = await createProduct({ price: 10 });
    return createOrder(user, [toOrderItem(product, 2)], {
        status,
        ...(createdAt ? { createdAt } : {})
    });
};

describe('the file', () => {
    it('opens with the column names and writes one line per matching order, in the list`s order', async () => {
        await orderOf('older@example.com', OrderStatus.paid, new Date('2026-01-01T10:00:00Z'));
        await orderOf('newer@example.com', OrderStatus.paid, new Date('2026-02-01T10:00:00Z'));
        await orderOf('other@example.com', OrderStatus.pending, new Date('2026-03-01T10:00:00Z'));

        const file = await csvOf(
            await orderService.openOrderExport(
                { status: 'paid', sort: ['createdAt'] },
                asAdmin(),
                staff
            )
        );

        const [header, ...lines] = file.trim().split('\n');
        expect(header).toBe(ORDER_CSV_COLUMNS.join(','));
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('older@example.com');
        expect(lines[1]).toContain('newer@example.com');
        expect(lines[0]).toContain('2026-01-01T10:00:00.000Z');
        expect(lines[0]).toContain(',paid,');
        expect(lines[0]).toContain(',20,EUR,');
    });

    it('carries no address', async () => {
        await orderOf('buyer@example.com');

        const file = await csvOf(await orderService.openOrderExport({}, asAdmin(), staff));

        expect(file).not.toMatch(/street|shippingAddress|billingAddress/i);
    });

    it('escapes a cell a spreadsheet would run as a formula', async () => {
        await orderOf('=cmd@example.com');

        const file = await csvOf(await orderService.openOrderExport({}, asAdmin(), staff));

        expect(file).toContain("'=cmd@example.com");
        expect(file).not.toMatch(/(^|,)=cmd@example\.com/m);
    });

    it('holds only what the caller may read', async () => {
        const mine = await orderOf('mine@example.com');
        await orderOf('theirs@example.com');

        const file = await csvOf(
            await orderService.openOrderExport({}, asCustomer(String(mine.userId)), staff)
        );

        expect(file).toContain('mine@example.com');
        expect(file).not.toContain('theirs@example.com');
    });
});

describe('the cap', () => {
    it('refuses an export over it before any row is read, naming the cap', async () => {
        setEnvironment({ NODE_ORDER_EXPORT_MAX_ROWS: '1' });
        await orderOf('a@example.com');
        await orderOf('b@example.com');
        const audit = observePort(auditPort.emitAuditEvent);

        const refused = await orderService.openOrderExport({}, asAdmin(), staff);

        expect(refused).toMatchObject({
            success: false,
            status: 422,
            errors: [{ code: 'ORDER_EXPORT_TOO_LARGE' }]
        });
        expect(JSON.stringify(refused)).toContain('1');
        expect(audit).not.toHaveBeenCalled();
    });

    it('lets an export at the cap through', async () => {
        setEnvironment({ NODE_ORDER_EXPORT_MAX_ROWS: '1' });
        await orderOf('a@example.com');

        const file = await csvOf(await orderService.openOrderExport({}, asAdmin(), staff));

        expect(file.trim().split('\n')).toHaveLength(2);
    });
});

describe('the audit row', () => {
    it('records the filter and the row count, and never a row or an email', async () => {
        await orderOf('private@example.com');
        const audit = observePort(auditPort.emitAuditEvent);

        await csvOf(
            await orderService.openOrderExport(
                { status: 'paid', email: 'private@example.com' },
                asAdmin(),
                staff
            )
        );

        expect(audit).toHaveBeenCalledTimes(1);
        expect(audit).toHaveBeenCalledWith(
            expect.objectContaining({
                action: ordersAuditActions.ADMIN_ORDERS_EXPORTED,
                metadata: { filter: { status: 'paid', email: true }, rowCount: 1 }
            })
        );
        expect(JSON.stringify(audit.mock.calls)).not.toContain('private@example.com');
    });
});
