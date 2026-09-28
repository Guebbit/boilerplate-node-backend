/**
 * @module
 * `removeById`/`restoreById`'s audit rows — moved out of `createDeleteController`/
 * `createRestoreController` into this service (B11), matching every other module's write path
 * (rule 1, `docs/theory/module-lifecycle.md`). These pin that `ADMIN_PRODUCT_DELETED`/
 * `ADMIN_PRODUCT_RESTORED` still land, from the new layer, with the same fields.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { productService } from '../../service';
import { productsAuditActions } from '../../audit';
import * as auditPort from '@infrastructure/observability/audit';
import { observePort } from '@tests/ports';
import { callerContextAs } from '@tests/callers';

/*
 * The audit port is REPLACED, not spied on — see `orders/tests/integration/create-audit.test.ts`
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
    it('audits ADMIN_PRODUCT_DELETED with hardDelete:false in metadata on a soft delete', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct();
        const id = String(product._id);

        await productService.removeById(id, false, callerContextAs('admin'));

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: productsAuditActions.ADMIN_PRODUCT_DELETED,
                outcome: 'success',
                target_type: 'product',
                target_id: id,
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
                target_type: 'product',
                target_id: id,
                metadata: { hardDelete: true }
            })
        );
    });

    it('records no audit row when called with no context', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct();

        await productService.removeById(String(product._id));

        expect(auditSpy).not.toHaveBeenCalled();
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
                target_type: 'product',
                target_id: id
            })
        );
    });

    it('records no audit row when called with no context', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct();
        const id = String(product._id);
        await productService.removeById(id);

        await productService.restoreById(id);

        expect(auditSpy).not.toHaveBeenCalled();
    });
});
