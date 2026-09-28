/**
 * @module
 * `removeById`/`restoreById`'s audit rows — moved out of `createDeleteController`/
 * `createRestoreController` into this service (B11), matching every other module's write path
 * (rule 1, `docs/theory/module-lifecycle.md`). These pin that `ORDER_DELETED`/`ORDER_RESTORED`
 * still land, from the new layer, with the same fields.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { seedOrder } from '@modules/orders/tests/factories';
import { removeById, restoreById } from '@modules/orders/services';
import { ordersAuditActions } from '../../audit';
import * as auditPort from '@infrastructure/observability/audit';
import { observePort } from '@tests/ports';
import { callerContextAs } from '@tests/callers';
import { OrderStatus } from '@types';

/*
 * The audit port is REPLACED, not spied on — see `create-audit.test.ts` in this same directory
 * for the full reasoning (`jest.spyOn` cannot redefine the non-configurable getter a CommonJS
 * namespace import exposes).
 */
jest.mock('@infrastructure/observability/audit', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/audit')>(
        '@infrastructure/observability/audit'
    );
    const emitAuditEvent = jest.fn();
    return {
        __esModule: true,
        ...actual,
        emitAuditEvent,
        recordAudit: (
            context: Parameters<typeof actual.recordAudit>[0],
            fields: Parameters<typeof actual.recordAudit>[1]
        ) => {
            if (!context) return;
            emitAuditEvent(actual.buildAuditEvent(context, fields));
        }
    };
});

setupTestDb();

afterEach(() => jest.restoreAllMocks());

describe('removeById', () => {
    it('audits ORDER_DELETED with hardDelete:false in metadata on a soft delete', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const order = await seedOrder(OrderStatus.pending);

        await removeById(String(order._id), false, callerContextAs('admin'));

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: ordersAuditActions.ORDER_DELETED,
                outcome: 'success',
                target_type: 'order',
                target_id: String(order._id),
                metadata: { hardDelete: false }
            })
        );
    });

    it('audits ORDER_DELETED with hardDelete:true in metadata on a hard delete', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const order = await seedOrder(OrderStatus.pending);

        await removeById(String(order._id), true, callerContextAs('admin'));

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: ordersAuditActions.ORDER_DELETED,
                outcome: 'success',
                target_type: 'order',
                target_id: String(order._id),
                metadata: { hardDelete: true }
            })
        );
    });

    it('records no audit row when called with no context', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const order = await seedOrder(OrderStatus.pending);

        await removeById(String(order._id));

        expect(auditSpy).not.toHaveBeenCalled();
    });
});

describe('restoreById', () => {
    it('audits ORDER_RESTORED on a restore', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const order = await seedOrder(OrderStatus.pending);
        await removeById(String(order._id));

        await restoreById(String(order._id), callerContextAs('admin'));

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: ordersAuditActions.ORDER_RESTORED,
                outcome: 'success',
                target_type: 'order',
                target_id: String(order._id)
            })
        );
    });

    it('records no audit row when called with no context', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const order = await seedOrder(OrderStatus.pending);
        await removeById(String(order._id));

        await restoreById(String(order._id));

        expect(auditSpy).not.toHaveBeenCalled();
    });
});
