/**
 * @module
 * What `ORDER_UPDATED` says about an admin edit: the email, which is personal data, by name only.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { observePort } from '@tests/ports';
import { callerContextAs } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '../factories';
import { orderService } from '../../services';
import { ordersAuditActions } from '../../audit';
import * as auditPort from '@infrastructure/observability/audit';

/* The audit port is replaced, not spied on — see `tests/support/ports.ts`. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

setupTestDb();

afterEach(() => jest.restoreAllMocks());

/** The `metadata` of the `ORDER_UPDATED` row an edit wrote. */
const updatedMetadata = (spy: jest.SpiedFunction<typeof auditPort.emitAuditEvent>): unknown =>
    spy.mock.calls
        .map(([entry]) => entry)
        .find((entry) => entry.action === ordersAuditActions.ORDER_UPDATED)?.metadata;

describe('orderService.updateById — the audit row', () => {
    it('names the email when it moved, without its value', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ email: 'buyer@example.com' });
        const order = await createOrder(user, [toOrderItem(await createProduct(), 1)]);

        await orderService.updateById(
            String(order._id),
            { email: 'other@example.com' },
            callerContextAs('admin')
        );

        expect(updatedMetadata(auditSpy)).toEqual({ changedFields: ['email'] });
    });

    it('writes nothing for the email it already holds', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const user = await createUser({ email: 'buyer@example.com' });
        const order = await createOrder(user, [toOrderItem(await createProduct(), 1)]);

        await orderService.updateById(
            String(order._id),
            { email: order.email },
            callerContextAs('admin')
        );

        expect(updatedMetadata(auditSpy)).toEqual({});
    });
});
