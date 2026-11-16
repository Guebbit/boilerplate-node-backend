/**
 * @module
 * `removeById`/`restoreById`'s audit rows are written by this service, matching every other
 * module's write path (rule 1 of the page below). These pin that `ADMIN_PRODUCT_DELETED`/
 * `ADMIN_PRODUCT_RESTORED` land with the right fields.
 *
 * @see docs/build/module-lifecycle.md#before-you-start
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { productService } from '../../services';
import { productsAuditActions } from '../../audit';
import * as auditPort from '@infrastructure/observability/audit';
import { observePort } from '@tests/ports';
import { callerContextAs } from '@tests/callers';

/**
 * The audit port is REPLACED, not spied on — see `orders/tests/integration/create-audit.test.ts`
 * for the full reasoning (`jest.spyOn` cannot redefine the non-configurable getter a CommonJS
 * namespace import exposes).
 */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

setupTestDb();

afterEach(() => jest.restoreAllMocks());

describe('removeById', () => {
    it('audits ADMIN_PRODUCT_DELETED with hardDelete:false in metadata on a soft delete', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct();
        const id = String(product._id);

        await productService.removeById(id, false, callerContextAs('admin'));

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: productsAuditActions.ADMIN_PRODUCT_DELETED,
                outcome: 'success',
                targetType: 'product',
                targetId: id,
                metadata: { hardDelete: false }
            })
        );
    });

    it('audits ADMIN_PRODUCT_DELETED with hardDelete:true in metadata on a hard delete', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct();
        const id = String(product._id);

        await productService.removeById(id, true, callerContextAs('admin'));

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: productsAuditActions.ADMIN_PRODUCT_DELETED,
                outcome: 'success',
                targetType: 'product',
                targetId: id,
                metadata: { hardDelete: true }
            })
        );
    });
});

describe('restoreById', () => {
    it('audits ADMIN_PRODUCT_RESTORED on a restore', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct();
        const id = String(product._id);
        await productService.removeById(id);

        await productService.restoreById(id, callerContextAs('admin'));

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: productsAuditActions.ADMIN_PRODUCT_RESTORED,
                outcome: 'success',
                targetType: 'product',
                targetId: id
            })
        );
    });
});
