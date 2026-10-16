/**
 * @module
 * What `ADMIN_PRODUCT_UPDATED` says about money: the price, tax class and rate type an update
 * actually moved, as `{ from, to }`. The three set what a buyer pays and what VAT is charged, so a
 * "lower, sell, restore" has to be readable from the audit trail, not rebuilt from frozen order lines.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { productService } from '../../services';
import { productsAuditActions } from '../../audit';
import * as auditPort from '@infrastructure/observability/audit';
import { observePort } from '@tests/ports';
import { callerContextAs } from '@tests/callers';

/* The audit port is replaced, not spied on — see `delete-restore-audit.test.ts`. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

setupTestDb();

afterEach(() => jest.restoreAllMocks());

/** The `metadata` of the one `ADMIN_PRODUCT_UPDATED` row an update wrote. */
const updatedRowMetadata = (spy: jest.SpiedFunction<typeof auditPort.emitAuditEvent>) =>
    spy.mock.calls
        .map(([entry]) => entry)
        .find((entry) => entry.action === productsAuditActions.ADMIN_PRODUCT_UPDATED)?.metadata;

describe('productService.updateById — the audit row of a money edit', () => {
    it('carries from and to for each of price, taxClass and rateType that moved', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct({
            price: 10,
            taxClass: 'reduced',
            rateType: 'standard'
        });

        await productService.updateById(
            String(product._id),
            { price: 4.5, taxClass: 'zero', rateType: 'exempt' },
            callerContextAs('admin')
        );

        expect(updatedRowMetadata(auditSpy)).toEqual({
            changes: {
                price: { from: 10, to: 4.5 },
                taxClass: { from: 'reduced', to: 'zero' },
                rateType: { from: 'standard', to: 'exempt' }
            }
        });
    });

    it('says null for a field that was unset or is cleared', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct({ price: 10, taxClass: 'reduced' });

        await productService.updateById(
            String(product._id),
            { taxClass: null, rateType: 'standard' },
            callerContextAs('admin')
        );

        expect(updatedRowMetadata(auditSpy)).toEqual({
            changes: {
                taxClass: { from: 'reduced', to: null },
                rateType: { from: null, to: 'standard' }
            }
        });
    });

    it('names only what moved: a price sent unchanged, or an edit to other fields, writes no changes', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct({ price: 10 });

        await productService.updateById(
            String(product._id),
            { price: 10, translations: { en: { title: 'Renamed' } } },
            callerContextAs('admin')
        );

        expect(updatedRowMetadata(auditSpy)).toBeUndefined();
    });
});
